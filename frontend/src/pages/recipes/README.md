# Recipe Feature

This directory contains Vue pages for the recipe storage feature on evanheaton.com.

## Database Schema

Recipes are stored in the existing `PSPosts` DynamoDB table with `postType="RECIPE"`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| postId | String | Yes | UUID primary key |
| postType | String | Yes | "RECIPE" |
| createdDate | Number | Yes | Unix timestamp |
| author | String | Yes | Username |
| authorSub | String | Yes | Cognito user sub |
| title | String | Yes | Recipe title |
| description | String | No | Brief intro |
| ingredients | Array | Yes | List of ingredient objects |
| instructions | String | Yes | Markdown content |
| pictureUrl | String | No | S3 URL for recipe image |
| recipeTags | Array | No | List of tag strings (e.g., ["main", "quick", "vegetarian"]) |
| prepTime | Number | No | Prep time in minutes |
| cookTime | Number | No | Cook time in minutes |
| servings | Number | No | Number of servings |
| editedDate | Number | No | Unix timestamp of last edit |

### Ingredient Structure

```json
{
  "name": "flour",
  "quantity": "2",
  "unit": "cups",
  "notes": "sifted"
}
```

### Recipe Tags

Recipes support a flexible tag system. Example tags:

- `main`, `side`, `dessert`, `appetizer`, `breakfast`, `beverage` - Meal type
- `quick`, `slow-cooker`, `one-pot` - Cooking style
- `vegetarian`, `vegan`, `gluten-free`, `dairy-free` - Dietary
- `italian`, `mexican`, `asian`, `american` - Cuisine

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/posts?postType=RECIPE` | List all recipes |
| GET | `/posts/{postId}` | Get single recipe |
| POST | `/posts/new` | Create recipe (with `postType: "RECIPE"`) |
| POST | `/posts/{postId}` | Edit recipe |
| DELETE | `/posts/{postId}` | Delete recipe |

## Pages

| File | Route | Description |
|------|-------|-------------|
| RecipeListPage.vue | `/recipes` | List all recipes with category filter |
| RecipePage.vue | `/recipes/:postId` | View single recipe |
| RecipeEditorPage.vue | `/recipes/new`, `/recipes/:postId/edit` | Create/edit recipe |

## Components

Located in `frontend/src/components/recipes/`:

| Component | Purpose |
|-----------|---------|
| RecipeCard.vue | Card for list view (title, image, tag badges) |
| RecipeIngredients.vue | Formatted ingredient list display |
| RecipeInstructions.vue | Markdown-rendered instructions |
| IngredientEditor.vue | Dynamic ingredient input rows |
| TagFilter.vue | Tag filter buttons |
| RecipeMetadata.vue | Prep time, cook time, servings display |

## Authentication

- Viewing recipes: Public (no auth required)
- Creating/editing recipes: Admin only (Admins Cognito group)
