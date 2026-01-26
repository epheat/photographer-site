export interface Ingredient {
  quantity?: string;
  unit?: string;
  name: string;
  notes?: string;
}

export interface IngredientSection {
  name: string;
  ingredients: Ingredient[]
}

// used for editor page
export interface IngredientRow extends Ingredient {
  rowType: "ingredient" | "section"
}

export interface Recipe {
  postId?: string;
  title: string;
  author?: string;
  createdDate?: string;
  pictureUrl?: string;
  recipeTags?: string[];
  description?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  ingredients: (IngredientSection | Ingredient)[];
  instructions: string;
  previous?: { postId: string };
  next?: { postId: string };
}