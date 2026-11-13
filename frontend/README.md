# evanheaton.com frontend

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```

### Customize configuration
This app is built with [Vite](https://vite.dev/). See `vite.config.ts` and the
[Vite config reference](https://vite.dev/config/).

Build-time config is read from `import.meta.env` (prefix `VUE_APP_`, set via `envPrefix`
in `vite.config.ts`). Values come from the `.env` files locally and are injected per-stage
by the CDK website stack for deployed builds.

## Project structure
```
+ index.html - app entry HTML (Vite root); the app is injected here
+ public - static files served verbatim at the site root (e.g. favicon.ico)
+ src
  + assets - static files such as images
  + components - reusable Vue components live here
  + pages - Vue component pages
  + phaser - games root directory
    + battletd - tower defense game
  App.vue

```
