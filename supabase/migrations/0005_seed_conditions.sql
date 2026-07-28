-- =====================================================================
-- D&D 5e 기본 상태 효과 (campaign_id가 null이면 모든 캠페인에서 사용)
-- =====================================================================

insert into public.conditions (campaign_id, key, name, icon, description) values
  (null, 'blinded',       '장님',      'eye-off',      '볼 수 없으며 시각에 의존하는 판정에 자동 실패한다. 공격 굴림에 불리점, 자신을 향한 공격에 이점.'),
  (null, 'charmed',       '매혹',      'heart',        '매혹한 자를 공격할 수 없고, 매혹한 자는 사회적 상호작용에 이점을 받는다.'),
  (null, 'deafened',      '귀머거리',  'ear-off',      '들을 수 없으며 청각에 의존하는 판정에 자동 실패한다.'),
  (null, 'frightened',    '공포',      'ghost',        '공포 근원이 시야에 있으면 능력 판정과 공격 굴림에 불리점. 근원에게 다가갈 수 없다.'),
  (null, 'grappled',      '붙잡힘',    'grab',         '이동 속도가 0이 된다.'),
  (null, 'incapacitated', '행동 불능', 'ban',          '행동이나 반응을 할 수 없다.'),
  (null, 'invisible',     '투명',      'eye-closed',   '볼 수 없으며 공격 굴림에 이점, 자신을 향한 공격에 불리점.'),
  (null, 'paralyzed',     '마비',      'zap-off',      '행동 불능이며 움직이거나 말할 수 없다. 근접 공격은 자동 치명타.'),
  (null, 'petrified',     '석화',      'gem',          '무생물로 변한다. 행동 불능이며 모든 피해에 저항.'),
  (null, 'poisoned',      '중독',      'flask-conical','공격 굴림과 능력 판정에 불리점.'),
  (null, 'prone',         '넘어짐',    'arrow-down',   '포복 이동만 가능. 근접 공격에 이점, 원거리 공격에 불리점.'),
  (null, 'restrained',    '구속',      'link',         '이동 속도 0. 공격 굴림에 불리점, 자신을 향한 공격에 이점, 민첩 내성에 불리점.'),
  (null, 'stunned',       '기절',      'star',         '행동 불능이며 힘·민첩 내성에 자동 실패한다.'),
  (null, 'unconscious',   '의식 불명', 'moon',         '행동 불능이자 넘어짐 상태. 근접 공격은 자동 치명타.'),
  (null, 'exhaustion',    '탈진',      'battery-low',  '단계에 따라 누적되는 불이익을 받는다. (1~6단계)'),
  (null, 'concentrating', '집중',      'brain',        '주문에 집중하고 있다. 피해를 받으면 건강 내성이 필요하다.')
on conflict (campaign_id, key) do update
  set name = excluded.name, icon = excluded.icon, description = excluded.description;

-- 기본 카드 템플릿
insert into public.card_templates (id, campaign_id, name, card_type, description, payload, is_system) values
  (gen_random_uuid(), null, '일반 몬스터', 'monster', '표준 능력치와 기본 행동을 가진 몬스터', '{}'::jsonb, true),
  (gen_random_uuid(), null, '보스 몬스터', 'monster', '전설적 행동과 소굴 행동을 포함한 보스', '{}'::jsonb, true),
  (gen_random_uuid(), null, 'NPC', 'npc', '이름, 외형, 목적, 비밀', '{}'::jsonb, true),
  (gen_random_uuid(), null, '상점', 'location', '판매 품목과 주인 정보', '{}'::jsonb, true),
  (gen_random_uuid(), null, '퀘스트', 'quest', '의뢰인, 목표, 보상, 마감', '{}'::jsonb, true),
  (gen_random_uuid(), null, '장소', 'location', '분위기, 주요 인물, 사건 훅', '{}'::jsonb, true),
  (gen_random_uuid(), null, '마법 아이템', 'item', '희귀도, 조율, 효과', '{}'::jsonb, true),
  (gen_random_uuid(), null, '일반 핸드아웃', 'handout', '플레이어에게 보여줄 문서', '{}'::jsonb, true),
  (gen_random_uuid(), null, '함정', 'rule', '발동 조건, 탐지 DC, 피해', '{}'::jsonb, true),
  (gen_random_uuid(), null, '퍼즐', 'rule', '단서, 해답, 힌트', '{}'::jsonb, true)
on conflict do nothing;
