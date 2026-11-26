# CHG-004: devolução à fila dos áudios longos

- Backup: `data-repair-backup.tsv` (4 linhas, estado antes do reparo).
- Reparo (2026-11-25): `UPDATE attachments SET processing_status = 'pending', processing_error = NULL, updated_at = now() WHERE id IN (<os 4 do backup>) AND processing_status = 'failed' AND processing_error = 'unavailable'`. Resultado: 4 linhas.
- Volta atrás: `UPDATE attachments SET processing_status = 'failed', processing_error = 'unavailable' WHERE id IN (<os 4 do backup>) AND processing_status = 'pending'`.
- Efeito: o worker, ao subir com o código corrigido, recoloca na fila os anexos pendentes sem job (`sweepPendingMedia`).
