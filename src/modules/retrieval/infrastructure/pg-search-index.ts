import type { Queryable } from "../../../platform/db/index.js";
import type { QueryVector, SearchIndex, SearchKind } from "../application/search-evidence.js";
import type { Evidence } from "../domain/evidence.js";
import { QUESTION_FILLER_WORDS } from "../domain/query.js";

interface Row {
  message_id: string;
  text: string;
  score: number;
  author: string;
  source_title: string;
  sent_at: Date;
  kind: string;
  audio_start_s: string | null;
  audio_end_s: string | null;
  duration_s: string | null;
}

/**
 * Título da citação (feature 009, D-11): o guardado aparece como "Guardados · <tema>", pelo item ligado à mensagem
 * (um item por mensagem guardada); as outras fontes, pelo título da conversa.
 */
export const SOURCE_TITLE = `CASE WHEN s.kind = 'saved'
         THEN concat_ws(' · ', 'Guardados', (SELECT th.name FROM evidence_references e
                                              JOIN knowledge_items k ON k.id = e.knowledge_item_id
                                              JOIN themes th ON th.id = k.theme_id
                                             WHERE e.message_id = m.id LIMIT 1))
         ELSE s.title END AS source_title`;

/**
 * Busca textual em português (D-10). Cada termo da pergunta (sem stopwords nem palavras de pergunta)
 * entra como OU; o score é a fração dos termos presentes no trecho (0 a 1) e o ts_rank desempata.
 * O filtro de espaço está dentro da própria query (RN-05) e fontes em exclusão ficam de fora.
 * Com `kind` ($5), só entram mensagens desse tipo (feature 005, emenda E001: só áudios). Com `sourceIds` ($6), só
 * as dessas fontes (feature 006, RN-11).
 */
const SQL = `
WITH terms AS (
  SELECT coalesce(array_agg(DISTINCT lex), '{}') AS lexs
    FROM unnest(tsvector_to_array(to_tsvector('palantir_pt', $2))) AS lex
   WHERE lex <> ALL (tsvector_to_array(to_tsvector('palantir_pt', $4)))
), q AS (
  SELECT lexs,
         CASE WHEN cardinality(lexs) = 0 THEN NULL
              ELSE to_tsquery('simple', array_to_string(ARRAY(SELECT quote_literal(l) FROM unnest(lexs) l), ' | '))
         END AS query
    FROM terms
)
SELECT c.message_id, c.text,
       (SELECT count(*) FROM unnest(q.lexs) l WHERE c.tsv @@ to_tsquery('simple', quote_literal(l)))::float8
         / cardinality(q.lexs) AS score,
       COALESCE(p.display_name, p.external_id) AS author, ${SOURCE_TITLE}, m.sent_at, m.kind,
       c.audio_start_s, c.audio_end_s, a.duration_s
  FROM q
  JOIN message_chunks c ON c.tsv @@ q.query
  JOIN messages m ON m.id = c.message_id
  JOIN participants p ON p.id = m.participant_id
  JOIN sources s ON s.id = m.source_id
  LEFT JOIN attachments a ON a.message_id = m.id
 WHERE c.space_id = $1 AND m.space_id = $1 AND s.status <> 'deleting'
   AND ($5::text IS NULL OR m.kind = $5)
   AND ($6::uuid[] IS NULL OR m.source_id = ANY($6))
 ORDER BY score DESC, ts_rank(c.tsv, q.query) DESC, m.sent_at DESC
 LIMIT $3`;

/** Colunas e junções de citação, comuns às três formas de busca; o filtro do espaço fica em cada uma (RN-02). */
const CITATION_COLUMNS = `COALESCE(p.display_name, p.external_id) AS author, ${SOURCE_TITLE}, m.sent_at, m.kind,
       c.audio_start_s, c.audio_end_s, a.duration_s`;
const CITATION_JOINS = `JOIN messages m ON m.id = c.message_id
  JOIN participants p ON p.id = m.participant_id
  JOIN sources s ON s.id = m.source_id
  LEFT JOIN attachments a ON a.message_id = m.id`;

/** Palavras de pergunta sem acento, para a busca por palavra parecida (o texto normalizado também não tem). */
const FILLER_NORMALIZED = [...new Set(QUESTION_FILLER_WORDS.map((w) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))];

/**
 * Palavra parecida (feature 007, RF-04, D-07): cada palavra da pergunta com 4 letras ou mais, que não seja palavra de
 * pergunta nem stopword, é comparada por trigramas com a palavra mais parecida do trecho. O sinal é a fração de palavras
 * encontradas com semelhança ≥ $7 (o operador `<%` usa o índice com o limiar padrão do pg_trgm, 0,6).
 */
const TYPO_SQL = `
WITH words AS (
  SELECT DISTINCT w
    FROM regexp_split_to_table(palantir_norm($2), '[^a-z0-9]+') AS w
   WHERE length(w) >= 4 AND w <> ALL ($4::text[]) AND to_tsvector('palantir_pt', w) <> ''::tsvector
), total AS (
  SELECT count(*)::float8 AS n FROM words
), hits AS (
  SELECT c.id AS chunk_id, count(DISTINCT w.w)::float8 AS matched
    FROM words w
    JOIN message_chunks c ON w.w <% c.text_norm
   WHERE c.space_id = $1 AND word_similarity(w.w, c.text_norm) >= $7
   GROUP BY c.id
)
SELECT c.message_id, c.text, h.matched / t.n AS score, ${CITATION_COLUMNS}
  FROM hits h
  CROSS JOIN total t
  JOIN message_chunks c ON c.id = h.chunk_id
  ${CITATION_JOINS}
 WHERE t.n > 0 AND m.space_id = $1 AND s.status <> 'deleting'
   AND ($5::text IS NULL OR m.kind = $5)
   AND ($6::uuid[] IS NULL OR m.source_id = ANY($6))
 ORDER BY score DESC, m.sent_at DESC, c.message_id
 LIMIT $3`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Sentido (feature 007, D-04, D-07): distância de cosseno no modelo ativo, com o mesmo cast e o mesmo filtro de modelo
 * do índice parcial criado na ativação. Id e dimensão são validados: nada de texto livre entra no SQL.
 */
function semanticSql(query: QueryVector): string {
  if (!UUID.test(query.modelId) || !Number.isInteger(query.dimensions) || query.dimensions < 1 || query.dimensions > 2000) {
    throw new RangeError("modelo inválido para a busca por sentido");
  }
  const cast = `vector(${query.dimensions})`;
  return `
SELECT c.message_id, c.text, 1 - ((e.embedding::${cast}) <=> $2::${cast}) AS score, ${CITATION_COLUMNS}
  FROM chunk_embeddings e
  JOIN message_chunks c ON c.id = e.chunk_id
  ${CITATION_JOINS}
 WHERE e.model_id = '${query.modelId}' AND e.space_id = $1 AND c.space_id = $1 AND m.space_id = $1 AND s.status <> 'deleting'
   AND ($4::text IS NULL OR m.kind = $4)
   AND ($5::uuid[] IS NULL OR m.source_id = ANY($5))
 ORDER BY (e.embedding::${cast}) <=> $2::${cast}, c.message_id
 LIMIT $3`;
}

const DEFAULT_TYPO_SIMILARITY = 0.6;

function toEvidence(r: Row): Evidence {
  return {
    messageId: r.message_id,
    chunkText: r.text,
    score: Number(r.score),
    author: r.author,
    sourceTitle: r.source_title,
    sentAt: new Date(r.sent_at),
    kind: r.kind,
    ...(r.audio_start_s === null || r.audio_end_s === null ? {} : { audioStartS: Number(r.audio_start_s), audioEndS: Number(r.audio_end_s) }),
    ...(r.duration_s === null ? {} : { durationSeconds: Number(r.duration_s) }),
  };
}

const sourcesParam = (sourceIds?: readonly string[]) => (sourceIds ? [...sourceIds] : null);

export function createPgSearchIndex(db: Queryable, options: { readonly typoMinSimilarity?: number; readonly typo?: boolean } = {}): SearchIndex {
  const index: SearchIndex = {
    async search(spaceId, query, limit, kind, sourceIds): Promise<Evidence[]> {
      const { rows } = await db.query<Row>(SQL, [spaceId, query, limit, QUESTION_FILLER_WORDS.join(" "), kind ?? null, sourcesParam(sourceIds)]);
      return rows.map(toEvidence);
    },
    async typo(spaceId: string, query: string, limit: number, kind?: SearchKind, sourceIds?: readonly string[]): Promise<Evidence[]> {
      const params = [spaceId, query, limit, FILLER_NORMALIZED, kind ?? null, sourcesParam(sourceIds), options.typoMinSimilarity ?? DEFAULT_TYPO_SIMILARITY];
      const { rows } = await db.query<Row>(TYPO_SQL, params);
      return rows.map(toEvidence);
    },
    async semantic(spaceId: string, query: QueryVector, limit: number, kind?: SearchKind, sourceIds?: readonly string[]): Promise<Evidence[]> {
      const { rows } = await db.query<Row>(semanticSql(query), [spaceId, `[${query.vector.join(",")}]`, limit, kind ?? null, sourcesParam(sourceIds)]);
      return rows.map(toEvidence);
    },
  };
  if (options.typo === false) delete index.typo;
  return index;
}
