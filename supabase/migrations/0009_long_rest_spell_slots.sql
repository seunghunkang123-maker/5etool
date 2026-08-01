-- =====================================================================
-- 긴 휴식에 주문 슬롯을 되돌린다.
--
-- 5e 규칙에서 주문 슬롯은 긴 휴식으로 모두 회복된다.
-- 슬롯 칸 수를 화면에서 직접 정할 수 있게 되면서 이 처리가 필요해졌다.
-- sheet는 jsonb 열이라 스키마를 바꾸지 않고 배열 안의 current만 max로 맞춘다.
-- =====================================================================

create or replace function public.apply_rest(p_character_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid := public.character_campaign_id(p_character_id);
begin
  if not public.owns_character(p_character_id) and not public.is_campaign_dm(v_campaign_id) then
    raise exception '휴식을 적용할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.character_resources
     set current = max
   where character_id = p_character_id
     and (recharge = 'short' or (p_kind = 'long' and recharge = 'long'));

  if p_kind = 'long' then
    update public.player_characters
       set hp = max_hp,
           temp_hp = 0,
           death_saves = '{"successes":0,"failures":0}'::jsonb,
           -- 주문 슬롯을 모두 채운다. 슬롯이 없거나 배열이 아니면 그대로 둔다.
           sheet = case
             when jsonb_typeof(sheet -> 'spell_slots') = 'array' then
               jsonb_set(
                 sheet,
                 '{spell_slots}',
                 coalesce(
                   (
                     select jsonb_agg(jsonb_set(slot, '{current}', coalesce(slot -> 'max', '0'::jsonb)))
                     from jsonb_array_elements(sheet -> 'spell_slots') as slot
                   ),
                   '[]'::jsonb
                 )
               )
             else sheet
           end
     where id = p_character_id;
  end if;
end;
$$;

grant execute on function public.apply_rest(uuid, text) to authenticated;
