import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  const saved = db.prepare('SELECT body FROM state WHERE id = 1').get();
  const state = saved ? JSON.parse(saved.body) : { players: {}, rooms: {}, tokens: {} };
  const write = db.prepare('INSERT INTO state VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body');
  db.exec('CREATE TABLE IF NOT EXISTS profile_images (player TEXT, kind TEXT, revision TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (player, kind))');
  const imageList=db.prepare('SELECT kind, revision FROM profile_images WHERE player = ?');
  const imageGet=db.prepare('SELECT bytes FROM profile_images WHERE player = ? AND kind = ? AND revision = ?');
  const imagePut=db.prepare('INSERT INTO profile_images VALUES (?, ?, ?, ?) ON CONFLICT(player, kind) DO UPDATE SET revision=excluded.revision, bytes=excluded.bytes');
  const imageRemove=db.prepare('DELETE FROM profile_images WHERE player = ? AND kind = ?');
  db.exec("CREATE TABLE IF NOT EXISTS bug_reports (id TEXT PRIMARY KEY, player TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', screenshot BLOB NOT NULL); CREATE INDEX IF NOT EXISTS bug_reports_player ON bug_reports(player, status, created)");
  const reportColumns=db.prepare('PRAGMA table_info(bug_reports)').all();
  const additions={kind:"TEXT NOT NULL DEFAULT 'bug'",target:'TEXT',reason:'TEXT',media_type:"TEXT NOT NULL DEFAULT 'image/jpeg'"};
  for(const [name,definition] of Object.entries(additions)){
    if(!reportColumns.some(column=>column.name===name))db.exec('ALTER TABLE bug_reports ADD COLUMN '+name+' '+definition);
  }
  const reportAdd=db.prepare('INSERT INTO bug_reports (id,player,title,description,created,screenshot,kind,target,reason,media_type) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const reportList=db.prepare('SELECT id,player,title,description,created,status,kind,target,reason,media_type FROM bug_reports ORDER BY created DESC LIMIT 100');
  const reportOwn=db.prepare('SELECT id,title,created,status,kind,target,reason FROM bug_reports WHERE player=? ORDER BY created DESC LIMIT 25');
  const reportInfo=db.prepare('SELECT title FROM bug_reports WHERE id=?');
  const reportImage=db.prepare('SELECT screenshot,media_type FROM bug_reports WHERE id=?');
  const reportCount=db.prepare('SELECT count(*) AS count FROM bug_reports WHERE player=? AND created>?');
  const reportConfirmed=db.prepare("SELECT count(*) AS count FROM bug_reports WHERE player=? AND status='confirmed' AND kind='bug'");
  const reportReview=db.prepare("UPDATE bug_reports SET status=? WHERE id=? AND status='pending'");
  db.exec('CREATE TABLE IF NOT EXISTS user_numbers (player TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE)');
  const numberFor = db.prepare('SELECT number FROM user_numbers WHERE player=?');
  const playerFor = db.prepare('SELECT player FROM user_numbers WHERE number=?');
  const assignNumber = db.prepare('INSERT OR IGNORE INTO user_numbers (player,number) VALUES (?,?)');
  function publicNumber(player) {
    let row = numberFor.get(player);
    while (!row) {
      const number = 1000000000000000000n + randomBytes(8).readBigUInt64BE() % 9000000000000000000n;
      assignNumber.run(player, number.toString());
      row = numberFor.get(player);
    }
    return row.number;
  }
  return { state, publicNumber, playerByNumber:number=>playerFor.get(number)?.player,
    reports:{add:(...args)=>reportAdd.run(...args),list:()=>reportList.all(),own:id=>reportOwn.all(id),
      info:id=>reportInfo.get(id),image:id=>reportImage.get(id),count:(id,after)=>reportCount.get(id,after).count,
      confirmed:id=>reportConfirmed.get(id).count,review:(status,id)=>reportReview.run(status,id).changes},
    images:{list:id=>imageList.all(id),get:(...args)=>imageGet.get(...args),put:(...args)=>imagePut.run(...args),remove:(...args)=>imageRemove.run(...args)},
    save: () => write.run(JSON.stringify(state)), close: () => db.close() };
}

