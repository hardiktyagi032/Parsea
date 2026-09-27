import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS name varchar,
      ADD COLUMN IF NOT EXISTS phone_number varchar,
      ADD COLUMN IF NOT EXISTS semester numeric,
      ADD COLUMN IF NOT EXISTS role varchar DEFAULT 'student'`)
    await client.query(`UPDATE public.users SET role = 'student' WHERE role IS NULL`)
    await client.query(`CREATE TABLE IF NOT EXISTS public.conversations (
      id serial PRIMARY KEY,
      owner_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      title varchar NOT NULL,
      subject varchar,
      semester numeric,
      messages jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_message_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
    await client.query('CREATE INDEX IF NOT EXISTS conversations_owner_idx ON public.conversations(owner_id)')
    await client.query('CREATE INDEX IF NOT EXISTS conversations_last_message_idx ON public.conversations(last_message_at DESC)')
    await client.query('COMMIT')
    console.log('Auth profile fields and conversations table are ready.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((error) => { console.error(error); process.exitCode = 1 })
