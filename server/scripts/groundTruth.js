// Jedan čitač ground trutha za sve skripte mjernog okvira.
//
// Ground truth živi u eval/ground-truth/<scenario_id>.json — verzioniranom
// artefaktu koji ide u prilog rada. Prije je bio ugniježđen u evalScenarios.js
// kao `expectedResult`, pa su ga evalHarness.js i scoreEvalResults.js čitali
// svaki na svoj način i s dvije različite implementacije istog mjerila.

const fs = require('node:fs');
const path = require('node:path');

const GROUND_TRUTH_DIR = path.join(__dirname, '..', 'eval', 'ground-truth');

function readGroundTruth(scenarioId) {
  const file = path.join(GROUND_TRUTH_DIR, `${scenarioId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Oblik koji očekuje scoreEvalResults.js (nekadašnji `expectedResult`). */
function loadGroundTruthForScoring(scenarioId) {
  const gt = readGroundTruth(scenarioId);
  if (!gt) return null;
  return {
    decision: gt.expected_decision,
    expects_refusal: gt.expects_refusal === true,
    input_modality: gt.input_modality || null,
    department_name: gt.fields?.department_name?.value ?? null,
    total_amount_acceptable: gt.fields?.total_amount?.acceptable ?? null,
    items: (gt.fields?.items || []).map((it) => ({
      item_name: it.item_name?.value ?? null,
      quantity: it.quantity?.value ?? null,
      category_name: it.category_name?.value ?? null,
    })),
    notes: gt.notes || null,
  };
}

module.exports = { readGroundTruth, loadGroundTruthForScoring, GROUND_TRUTH_DIR };
