-- Garante upsert por username+mode+topic
alter table public.user_memory
  drop constraint if exists user_memory_username_mode_topic_key;

alter table public.user_memory
  add constraint user_memory_username_mode_topic_key
  unique (username, mode, topic);

-- Política para service role poder escrever via username
create policy "service role gerencia memoria"
  on public.user_memory for all
  using (true)
  with check (true);
