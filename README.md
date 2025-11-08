# AlphaSolve

A mathematical equation solver with real-time collaboration support.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.2.2.

## Features

- **Equation Solving**: Solve mathematical equations using plugin-based solvers
- **Real-time Collaboration**: Share projects via WebSocket and collaborate in real-time
- **Plugin System**: Extend functionality with Git-based plugins
- **Cell-based Interface**: Organize work in equation, note, and folder cells
- **Context Propagation**: Automatic dependency resolution between cells

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Sharing Projects

To share a project and collaborate in real-time:

1. Click the share button (network icon) in the project header
2. Enter your name and server URL
3. Click "Connect & Share"
4. Copy and share the generated link with collaborators

**Note**: You'll need a WebSocket server running to use the share feature. See `docs/websocket-packets.md` for implementation details.

## Documentation

- **Plugin Development**: `docs/plugin-development.md`
- **WebSocket Packets**: `docs/websocket-packets.md`
- **Share Feature**: `docs/share-feature-summary.md`
- **Cell Functions**: `docs/cell-functions.md`
- **Meta Functions**: `docs/meta-functions.md`
- **Proc Macros**: `docs/proc-macros.md`

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
