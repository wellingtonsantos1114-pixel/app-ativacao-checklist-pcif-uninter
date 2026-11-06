import {PGlite} from '@electric-sql/pglite'
import {sources,catalogSql,invariantsSql,writeBundle} from './sql.mjs'
export async function database(){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,encrypted_password text);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`)
 return db
}
export async function generate(){
 const db=await database()
 try{
  await db.exec('create publication supabase_realtime;')
  for(const migration of await sources())await db.exec(migration.sql)
  await db.exec(invariantsSql)
  const expected=(await db.query(catalogSql)).rows[0].catalog
  const path=await writeBundle(expected)
  console.log('Pacote SQL gerado e validado em PostgreSQL local: '+path)
  return expected
 }finally{await db.close()}
}
if(process.argv[1]?.endsWith('reference.mjs'))await generate()
