import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://shijanuixtyayskcrdgo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWphbnVpeHR5YXlza2NyZGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTk1ODMsImV4cCI6MjA5MzIzNTU4M30.hlAFCXzsd_jgtGkNpdCWNOVhrIWy5YPYzJtGG5cA5OQ'

export const supabase = createClient(supabaseUrl, supabaseKey)