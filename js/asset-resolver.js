(function exposeAssetResolver() {
  const safeId = value => {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
  };

  window.MacroBalanceAssets = Object.freeze({
    food(foodOrId) {
      const id = safeId(typeof foodOrId === 'object' ? foodOrId?.id : foodOrId);
      return id ? `/assets/foods/${id}.jpe` : '';
    },
    dish(mealOrId) {
      const id = safeId(
        typeof mealOrId === 'object'
          ? mealOrId?.id || mealOrId?.dish_id
          : mealOrId
      );
      // Convención del catálogo estable: /{dish_id}.jpg. No se usa dishes.image
      // porque gran parte del JSON conserva una ruta histórica inexistente.
      return id ? `/${id}.jpg` : '';
    }
  });
})();
