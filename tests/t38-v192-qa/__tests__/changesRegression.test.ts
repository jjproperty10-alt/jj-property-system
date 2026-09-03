// Focused regression for tests/t38-v192-qa/t38.accounting.ts `changes()`. No DB / no cert2.
// Guards the ts-jest compile target: under target 'es5', `for (const k of new Set([...]))`
// downlevels to a `.length` index loop that iterates 0 times, so changes() always returned []
// and the determinism assertion was vacuous. Under 'es2017' the Set iterates natively.
import { changes } from '../t38.accounting'

describe('changes() detects real transitions (ts-jest ES2017 target guard)', () => {
  test('value change -> delta', () => {
    expect(changes({ '$.a': 1 }, { '$.a': 2 })).toEqual([{ path: '$.a', kind: 'delta', delta: 1 }])
  })
  test('added value -> set', () => {
    expect(changes({}, { '$.a': 5 })).toEqual([{ path: '$.a', kind: 'set', to: 5 }])
  })
  test('removed and cleared value -> clear', () => {
    expect(changes({ '$.a': 7 }, {})).toEqual([{ path: '$.a', kind: 'clear', from: 7 }])
    expect(changes({ '$.a': 7 }, { '$.a': null })).toEqual([{ path: '$.a', kind: 'clear', from: 7 }])
  })
  test('identical maps -> [] (and the Set-union actually visited the keys)', () => {
    expect(changes({ '$.a': 1, '$.b': 2 }, { '$.a': 1, '$.b': 2 })).toEqual([])
    expect(changes({ '$.a': 1, '$.b': 2 }, { '$.a': 1, '$.b': 3 })).toEqual([{ path: '$.b', kind: 'delta', delta: 1 }])
  })
})
