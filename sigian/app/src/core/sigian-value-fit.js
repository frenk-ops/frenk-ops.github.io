(function (A) {
  "use strict";

  const FIT_SCHEMA_VERSION = 1;
  const DEFAULT_LAMBDAS = Object.freeze([0.5, 1, 2, 4, 8, 16, 32]);

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function add(map, key, value = 1) {
    map[key] = finite(map[key], 0) + finite(value, 0);
  }

  function rawFeatures(sample) {
    const features = { bias:1 };
    const creature = sample?.type === "creature";
    add(features, creature ? "type:creature" : "type:spell");

    if (creature) {
      const attack = Math.max(0, finite(sample.body?.attack, 0));
      const health = Math.max(0, finite(sample.body?.health, 0));
      add(features, "body:attack", attack);
      add(features, "body:health-first30", Math.min(30, health));
      add(features, "body:health-over30-sqrt", Math.sqrt(Math.max(0, health - 30)));
      add(features, "body:attack-durability", attack * Math.sqrt(Math.max(1, health)) / 10);
    }

    add(features, "recipe:sigil-count", sample?.sigilCount || 0);
    let gradeMagnitude = 0;
    let areaGradeMagnitude = 0;
    let persistentGradeMagnitude = 0;

    (sample?.sigils || []).forEach(sigil => {
      const gradeValue = Math.abs(finite(sigil.recoveredGradeValue, 0));
      gradeMagnitude += gradeValue;
      if (sigil.area) areaGradeMagnitude += gradeValue;
      if (sigil.timing === "persistent" || sigil.timing === "repeatable") persistentGradeMagnitude += gradeValue;

      add(features, `sigil:${sigil.sigilId}`);
      add(features, `timing:${sigil.timing || "other"}`);
      add(features, `target:${sigil.targetShape || "intrinsic"}`);
      if (sigil.area) add(features, "shape:area");
      if (sigil.intrinsicMalus) add(features, "shape:intrinsic-malus");

      (sigil.modifiers || []).forEach(modifier => {
        add(features, `modifier:${modifier.id}`);
        add(features, `modifier-family:${modifier.family || "unknown"}`);
      });
    });

    add(features, "grade:magnitude", gradeMagnitude);
    add(features, "grade:area-magnitude", areaGradeMagnitude);
    add(features, "grade:persistent-magnitude", persistentGradeMagnitude);
    return features;
  }

  function featureNames(samples) {
    const names = new Set(["bias"]);
    (samples || []).forEach(sample => {
      Object.keys(rawFeatures(sample)).forEach(name => names.add(name));
    });
    return ["bias", ...[...names].filter(name => name !== "bias").sort()];
  }

  function statsForFeatures(samples, names) {
    const means = {};
    const stds = {};
    names.forEach(name => {
      if (name === "bias") {
        means[name] = 0;
        stds[name] = 1;
        return;
      }
      const values = samples.map(sample => finite(rawFeatures(sample)[name], 0));
      const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
      const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, values.length);
      means[name] = mean;
      stds[name] = Math.sqrt(variance) || 1;
    });
    return { means, stds };
  }

  function rowForSample(sample, names, stats) {
    const raw = rawFeatures(sample);
    return names.map(name => {
      if (name === "bias") return 1;
      return (finite(raw[name], 0) - stats.means[name]) / stats.stds[name];
    });
  }

  function solveLinearSystem(matrix, vector) {
    const n = vector.length;
    const augmented = matrix.map((row, index) => [...row, vector[index]]);

    for (let column = 0; column < n; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < n; row += 1) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      }
      if (Math.abs(augmented[pivot][column]) < 1e-10) continue;
      [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

      const divisor = augmented[column][column];
      for (let k = column; k <= n; k += 1) augmented[column][k] /= divisor;

      for (let row = 0; row < n; row += 1) {
        if (row === column) continue;
        const factor = augmented[row][column];
        if (Math.abs(factor) < 1e-14) continue;
        for (let k = column; k <= n; k += 1) {
          augmented[row][k] -= factor * augmented[column][k];
        }
      }
    }

    return augmented.map((row, index) => {
      const diagonal = row[index];
      if (Math.abs(diagonal) < 1e-8 && Math.abs(row[n]) < 1e-8) return 0;
      return finite(row[n], 0);
    });
  }

  function fitRidge(samples, lambda = 4) {
    if (!Array.isArray(samples) || samples.length < 2) throw new Error("Servono almeno due campioni per il fitting.");
    const names = featureNames(samples);
    const stats = statsForFeatures(samples, names);
    const rows = samples.map(sample => rowForSample(sample, names, stats));
    const targets = samples.map(sample => finite(sample.printedLevel, 0));
    const size = names.length;
    const xtx = Array.from({ length:size }, () => Array(size).fill(0));
    const xty = Array(size).fill(0);

    rows.forEach((row, rowIndex) => {
      for (let i = 0; i < size; i += 1) {
        xty[i] += row[i] * targets[rowIndex];
        for (let j = 0; j < size; j += 1) xtx[i][j] += row[i] * row[j];
      }
    });

    for (let i = 1; i < size; i += 1) xtx[i][i] += Math.max(0, finite(lambda, 0));
    const coefficients = solveLinearSystem(xtx, xty);

    function predict(sample) {
      const row = rowForSample(sample, names, stats);
      return row.reduce((sum, value, index) => sum + value * coefficients[index], 0);
    }

    const rawWeights = {};
    let rawIntercept = coefficients[0] || 0;
    names.forEach((name, index) => {
      if (name === "bias") return;
      const weight = coefficients[index] / stats.stds[name];
      rawWeights[name] = weight;
      rawIntercept -= weight * stats.means[name];
    });

    return {
      schemaVersion: FIT_SCHEMA_VERSION,
      lambda:Math.max(0, finite(lambda, 0)),
      featureNames:names,
      standardizedCoefficients:coefficients,
      rawIntercept,
      rawWeights,
      predict
    };
  }

  function metrics(rows) {
    if (!rows.length) return { count:0, mae:null, rmse:null, exactRate:null, withinOneRate:null };
    const absolute = rows.map(row => Math.abs(row.prediction - row.actual));
    const squared = rows.map(row => (row.prediction - row.actual) ** 2);
    const rounded = rows.map(row => Math.max(1, Math.round(row.prediction)));
    const exact = rounded.filter((value, index) => value === rows[index].actual).length;
    const withinOne = rounded.filter((value, index) => Math.abs(value - rows[index].actual) <= 1).length;
    return {
      count:rows.length,
      mae:absolute.reduce((sum, value) => sum + value, 0) / rows.length,
      rmse:Math.sqrt(squared.reduce((sum, value) => sum + value, 0) / rows.length),
      exactRate:exact / rows.length,
      withinOneRate:withinOne / rows.length
    };
  }

  function leaveOneSchoolOut(samples, lambda) {
    const schools = [...new Set((samples || []).map(sample => sample.school))].sort();
    const predictions = [];
    const folds = [];

    schools.forEach(school => {
      const train = samples.filter(sample => sample.school !== school);
      const test = samples.filter(sample => sample.school === school);
      const model = fitRidge(train, lambda);
      const rows = test.map(sample => ({
        id:sample.id,
        school:sample.school,
        actual:sample.printedLevel,
        prediction:model.predict(sample)
      }));
      predictions.push(...rows);
      folds.push({ school, ...metrics(rows) });
    });

    return { rows:predictions, folds, metrics:metrics(predictions) };
  }

  function balancedFiveFold(samples, lambda, foldCount = 5) {
    const schools = [...new Set((samples || []).map(sample => sample.school))].sort();
    const schoolIndex = Object.fromEntries(schools.map((school, index) => [school, index]));
    const buckets = Array.from({ length:foldCount }, () => []);

    (samples || []).forEach(sample => {
      const levelIndex = Math.max(0, Math.trunc(finite(sample.printedLevel, 1)) - 1);
      const fold = (levelIndex + finite(schoolIndex[sample.school], 0)) % foldCount;
      buckets[fold].push(sample);
    });

    const predictions = [];
    const folds = [];
    buckets.forEach((test, foldIndex) => {
      const testIds = new Set(test.map(sample => sample.id));
      const train = samples.filter(sample => !testIds.has(sample.id));
      const model = fitRidge(train, lambda);
      const rows = test.map(sample => ({
        id:sample.id,
        school:sample.school,
        actual:sample.printedLevel,
        prediction:model.predict(sample)
      }));
      predictions.push(...rows);
      folds.push({ fold:foldIndex + 1, ...metrics(rows) });
    });
    return { rows:predictions, folds, metrics:metrics(predictions) };
  }

  function fitCandidate(samples, options = {}) {
    const lambdas = Array.isArray(options.lambdas) && options.lambdas.length
      ? options.lambdas.map(value => Math.max(0, finite(value, 0)))
      : [...DEFAULT_LAMBDAS];

    const candidates = lambdas.map(lambda => {
      const crossValidation = balancedFiveFold(samples, lambda, 5);
      const schoolStress = leaveOneSchoolOut(samples, lambda);
      return { lambda, crossValidation, schoolStress };
    }).sort((a, b) =>
      a.crossValidation.metrics.mae - b.crossValidation.metrics.mae
      || a.crossValidation.metrics.rmse - b.crossValidation.metrics.rmse
      || b.lambda - a.lambda
    );

    const selected = candidates[0];
    const model = fitRidge(samples, selected.lambda);
    const inSampleRows = samples.map(sample => ({
      id:sample.id,
      school:sample.school,
      actual:sample.printedLevel,
      prediction:model.predict(sample)
    }));

    const outliers = [...selected.crossValidation.rows]
      .map(row => ({ ...row, error:row.prediction - row.actual, absoluteError:Math.abs(row.prediction - row.actual) }))
      .sort((a,b) => b.absoluteError - a.absoluteError || a.id.localeCompare(b.id));

    const weights = Object.entries(model.rawWeights)
      .map(([feature, weight]) => ({ feature, weight }))
      .sort((a,b) => Math.abs(b.weight) - Math.abs(a.weight) || a.feature.localeCompare(b.feature));

    return {
      schemaVersion:FIT_SCHEMA_VERSION,
      selectedLambda:selected.lambda,
      candidates:candidates.map(candidate => ({
        lambda:candidate.lambda,
        crossValidation:candidate.crossValidation.metrics,
        schoolStress:candidate.schoolStress.metrics
      })),
      crossValidation:selected.crossValidation,
      schoolStress:selected.schoolStress,
      inSample:metrics(inSampleRows),
      outliers,
      rawIntercept:model.rawIntercept,
      weights,
      model
    };
  }

  A.SIGIAN_VALUE_FIT_SCHEMA_VERSION = FIT_SCHEMA_VERSION;
  A.sigianCalibrationRawFeatures = rawFeatures;
  A.fitSigianValueRidge = fitRidge;
  A.crossValidateSigianValueBySchool = leaveOneSchoolOut;
  A.crossValidateSigianValueBalanced = balancedFiveFold;
  A.fitSigianValueCandidate = fitCandidate;
})(window.Arcane = window.Arcane || {});
