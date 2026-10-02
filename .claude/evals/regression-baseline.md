# EVAL DEFINITION: regression-baseline

Freezes the known-good state at `97a6258` (v0.0.10) so later changes can be
checked against it. Baseline numbers live in `baseline.json`; run history in
`regression-baseline.log`.

## Regression Evals (code graders)

| Suite                    | Expected (passed/total) |
|--------------------------|-------------------------|
| raster-import.test.ts    | 14/14 |
| artwork-plan.test.ts     | 13/13 |
| gcode.test.ts            | 7/7   |
| speed-test.test.ts       | 6/6   |
| geometry.test.ts         | 6/6   |
| serial-grbl.test.ts      | 5/5 (mocked port) |
| svg-import.test.ts       | 5/5   |
| units.test.ts            | 5/5   |
| project-files.test.ts    | 3/3   |
| **Total**                | **64/64** |
| `npm run build`          | exit 0 |
| `npm run lint`           | exit 0 |

## Graders

Always exclude the hardware suite. `jest.config.js` `testMatch` picks it up,
and it opens a real serial port.

```bash
# Run 3 times (pass^3). Write JSON outside the repo.
npx jest --runInBand --testPathIgnorePatterns hardware --json --outputFile=<tmp>/runN.json

# Compare per-suite counts against master's baseline, not the branch copy,
# so a branch can't lower its own bar
git show master:.claude/evals/baseline.json > <tmp>/baseline.json
node -e "const b=require(process.argv[2]),r=require(process.argv[1]),p=require('path');let ok=r.success;for(const t of r.testResults){const f=p.basename(t.name),n=t.assertionResults.filter(a=>a.status==='passed').length;if(n<(b.suites[f]||0)){ok=false;console.log('REGRESSION',f,n,'<',b.suites[f])}}for(const f in b.suites)if(!r.testResults.some(t=>p.basename(t.name)===f)){ok=false;console.log('MISSING',f)}console.log(ok?'PASS':'FAIL')" <tmp>/runN.json <tmp>/baseline.json

npm run build && echo PASS || echo FAIL
npm run lint  && echo PASS || echo FAIL
```

## Success Metrics

- pass^3 = 1.00: all 3 Jest runs green
- No suite's passed count drops below baseline. A missing or deleted test is a
  regression even if the run is green. New tests are fine; update the baseline
  when they land.
- Build and lint exit 0

## Human Grader

For the user only. Agents never run this, and it is not part of an agent's
eval check.

```
[HUMAN REVIEW REQUIRED]
Change: anything touching src/core/serial*, G-code streaming, or profiles/
Check:  npm run test:hardware on the real TA4 (moves the machine; never during a job)
Risk Level: HIGH
When:   before a release, not on every check
```
