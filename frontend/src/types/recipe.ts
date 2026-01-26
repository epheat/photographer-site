export interface Ingredient {
  quantity?: string;
  unit?: string;
  name: string;
  notes?: string;
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
  ingredients: Ingredient[];
  instructions: string;
  previous?: { postId: string };
  next?: { postId: string };
}