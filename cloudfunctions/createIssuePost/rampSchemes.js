const RAMP_BASE_PROBLEM = '坡道衔接平台有坎';

const RAMP_ADDITIONAL_PROBLEMS = [
  '坡道太陡',
  '坡道太窄',
  '无扶手或高度不对',
  '坡面太滑',
  '坡道破损或头尾无平台'
];

const RAMP_PROBLEM_OPTIONS = [
  RAMP_BASE_PROBLEM,
  ...RAMP_ADDITIONAL_PROBLEMS
];

const READY_SCHEME = {
  code: 'D-1',
  title: '轮椅坡道改造方案',
  resourceStatus: 'ready',
  files: []
};

const PLACEHOLDER_SCHEMES = [
  'D-2.1',
  'D-2.2',
  'D-2.3',
  'D-3.1',
  'D-3.2'
].map((code) => ({
  code,
  title: '轮椅坡道改造方案',
  resourceStatus: 'placeholder',
  files: []
}));

function isRampCategory(categoryId, categoryName) {
  return categoryId === 'ramp' || String(categoryName || '').indexOf('坡道') > -1;
}

function normalizeRampProblems(value) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(RAMP_PROBLEM_OPTIONS);
  const seen = new Set();
  return value.filter((item) => {
    if (!allowed.has(item) || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function getRampSchemeMatch(options = {}) {
  const categoryId = options.categoryId || '';
  const categoryName = options.categoryName || '';
  const rampProblems = normalizeRampProblems(options.rampProblems);

  if (!isRampCategory(categoryId, categoryName)) {
    return {
      hasScheme: false,
      schemeMessage: '暂无方案',
      rampProblems: [],
      matchedSchemes: []
    };
  }

  const hasBaseProblem = rampProblems.indexOf(RAMP_BASE_PROBLEM) > -1;
  const hasAdditionalProblem = rampProblems.some((item) => (
    RAMP_ADDITIONAL_PROBLEMS.indexOf(item) > -1
  ));
  const matchedSchemes = [];

  if (hasBaseProblem) {
    matchedSchemes.push({ ...READY_SCHEME });
  }
  if (hasAdditionalProblem) {
    PLACEHOLDER_SCHEMES.forEach((item) => {
      matchedSchemes.push({ ...item });
    });
  }

  return {
    hasScheme: matchedSchemes.length > 0,
    schemeMessage: matchedSchemes.length > 0 ? '' : '暂无方案',
    rampProblems,
    matchedSchemes
  };
}

module.exports = {
  getRampSchemeMatch
};
