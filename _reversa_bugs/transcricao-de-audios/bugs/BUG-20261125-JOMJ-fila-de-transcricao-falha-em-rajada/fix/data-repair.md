# CHG-003: devolução à fila dos áudios com prazo não inteiro

- Backup: `data-repair-backup.tsv` (34 linhas, estado antes do reparo).
- Reparo (2026-11-25): `UPDATE attachments SET processing_status = 'pending', processing_error = NULL, updated_at = now() WHERE media_kind = 'audio' AND processing_status = 'failed' AND processing_error = 'unavailable'`. Resultado: 34 linhas, as mesmas do backup.
- Volta atrás: `UPDATE attachments SET processing_status = 'failed', processing_error = 'unavailable' WHERE id IN (<ids do backup>) AND processing_status = 'pending'`.
- Efeito: o worker, ao subir com o código corrigido, recoloca na fila os anexos pendentes sem job (`sweepPendingMedia`).
