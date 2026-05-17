const counters = {
  transitionsOk: 0,
  transitionsErr: 0,
  duplicateDeliveries: 0,
  compensations: 0,
};

const latencyMs = {}; // step → number[]

const incrementOk          = () => counters.transitionsOk++;
const incrementErr         = () => counters.transitionsErr++;
const incrementDuplicate   = () => counters.duplicateDeliveries++;
const incrementCompensation= () => counters.compensations++;

function recordLatency(step, ms) {
  if (!latencyMs[step]) latencyMs[step] = [];
  latencyMs[step].push(ms);
}

function avgLatency(step) {
  const arr = latencyMs[step];
  if (!arr || arr.length === 0) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function getSnapshot() {
  const latency = {};
  for (const step of Object.keys(latencyMs)) {
    latency[step] = { avgMs: avgLatency(step), samples: latencyMs[step].length };
  }
  return { counters: { ...counters }, latency };
}

function reset() {
  counters.transitionsOk = 0;
  counters.transitionsErr = 0;
  counters.duplicateDeliveries = 0;
  counters.compensations = 0;
  for (const k of Object.keys(latencyMs)) delete latencyMs[k];
}

module.exports = {
  incrementOk, incrementErr, incrementDuplicate, incrementCompensation,
  recordLatency, getSnapshot, reset,
};