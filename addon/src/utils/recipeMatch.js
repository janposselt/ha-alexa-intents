function normalizeRecipeText(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isNormalizedExactRecipeMatch(userInput, recipeName) {
  const left = normalizeRecipeText(userInput);
  const right = normalizeRecipeText(recipeName);
  return Boolean(left) && Boolean(right) && left === right;
}

module.exports = {
  normalizeRecipeText,
  isNormalizedExactRecipeMatch,
};
