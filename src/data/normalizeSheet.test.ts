import { describe, expect, it } from 'vitest';
import { defaultSheetExtra, normalizeCharacter, normalizeSheet } from './defaults';

/**
 * player_characters.sheet의 데이터베이스 기본값은 '{}'이다.
 * 화면은 spell_slots.map()이나 currency.gp처럼 항목이 항상 있다고 가정하므로,
 * 읽는 시점에 보정하지 않으면 "자원" 탭에서 오류가 난다.
 */
describe('normalizeSheet', () => {
  it('빈 객체를 기본 시트로 채운다', () => {
    const sheet = normalizeSheet({});
    expect(sheet.spell_slots).toEqual([]);
    expect(sheet.currency).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(sheet.languages).toBe(defaultSheetExtra().languages);
  });

  it('null과 배열 같은 잘못된 값도 기본 시트로 처리한다', () => {
    for (const bad of [null, undefined, [], 'text', 42]) {
      expect(normalizeSheet(bad).currency.gp).toBe(0);
      expect(Array.isArray(normalizeSheet(bad).spell_slots)).toBe(true);
    }
  });

  it('일부 항목만 있어도 나머지를 채운다', () => {
    const sheet = normalizeSheet({ notes: '메모', currency: { gp: 15 } });
    expect(sheet.notes).toBe('메모');
    expect(sheet.currency.gp).toBe(15);
    expect(sheet.currency.pp).toBe(0);
    expect(sheet.spell_slots).toEqual([]);
  });

  it('기존 값을 덮어쓰지 않는다', () => {
    const slots = [{ level: 1, current: 2, max: 4 }];
    const sheet = normalizeSheet({ spell_slots: slots, currency: { pp: 1, gp: 2, ep: 3, sp: 4, cp: 5 } });
    expect(sheet.spell_slots).toEqual(slots);
    expect(sheet.currency).toEqual({ pp: 1, gp: 2, ep: 3, sp: 4, cp: 5 });
  });

  it('형식이 깨진 슬롯 항목은 걸러낸다', () => {
    const sheet = normalizeSheet({ spell_slots: [{ level: 1, current: 1, max: 2 }, null, { max: 3 }, 'x'] });
    expect(sheet.spell_slots).toEqual([{ level: 1, current: 1, max: 2 }]);
  });

  it('음수 슬롯 값은 0으로 보정한다', () => {
    const sheet = normalizeSheet({ spell_slots: [{ level: 2, current: -5, max: -1 }] });
    expect(sheet.spell_slots[0]).toEqual({ level: 2, current: 0, max: 0 });
  });

  it('normalizeCharacter는 다른 필드를 보존한다', () => {
    const row = { id: 'abc', name: '엘라', sheet: {}, level: 3 };
    const result = normalizeCharacter(row);
    expect(result.id).toBe('abc');
    expect(result.name).toBe('엘라');
    expect(result.level).toBe(3);
    expect(result.sheet.currency.gp).toBe(0);
  });
});
