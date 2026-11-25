import type { Queryable } from "../../../platform/db/index.js";
import type { SearchIndex } from "../application/search-evidence.js";
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
       COALESCE(p.display_name, p.external_id) AS author, s.title AS source_title, m.sent_at, m.kind,
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

export function createPgSearchIndex(db: Queryable): SearchIndex {
  return {
    async search(spaceId, query, limit, kind, sourceIds): Promise<Evidence[]> {
      const { rows } = await db.query<Row>(SQL, [spaceId, query, limit, QUESTION_FILLER_WORDS.join(" "), kind ?? null, sourceIds ? [...sourceIds] : null]);
      return rows.map(toEvidence);
    },
  };
}
