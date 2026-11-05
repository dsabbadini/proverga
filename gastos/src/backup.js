// Cópia consistente do banco (funciona com o servidor rodando).
// Uso: node src/backup.js [pasta-destino]   (padrão: BACKUP_DIR ou ./backups)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const origem = process.env.DB_PATH || './data/gastos.db';
const destino = process.argv[2] || process.env.BACKUP_DIR || './backups';
const manter = Number(process.env.BACKUP_MANTER || 30);

mkdirSync(destino, { recursive: true });
const arquivo = join(destino, `gastos-${new Date().toISOString().slice(0, 10)}.db`);
rmSync(arquivo, { force: true });
const db = new DatabaseSync(origem, { readOnly: true });
db.exec(`VACUUM INTO '${arquivo.replace(/'/g, "''")}'`);
db.close();

// Mantém só os backups mais recentes.
const antigos = readdirSync(destino).filter((f) => /^gastos-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -manter);
for (const f of antigos) rmSync(join(destino, f));
console.log(`Backup salvo em ${arquivo}`);
