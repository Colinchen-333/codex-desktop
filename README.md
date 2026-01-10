# Codex Desktop

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-blue.svg)](https://vite.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-blue.svg)](https://tauri.app/)

A modern desktop application for AI-powered code assistance and project management, built with React 19, TypeScript 5.9, Vite 7, and Tauri.

## Features

- **AI-Powered Code Assistance**: Intelligent code suggestions and project management
- **Multi-Session Support**: Manage multiple AI sessions simultaneously
- **Real-time Collaboration**: Stream responses and handle real-time updates
- **File System Integration**: Native file operations through Tauri
- **Modern UI/UX**: Clean, responsive interface with Tailwind CSS
- **Type Safety**: Full TypeScript support with strict type checking
- **Performance Optimized**: LRU caching, efficient state management with Zustand
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Architecture

The application follows a modular architecture:

- **Frontend**: React 19 with TypeScript, Tailwind CSS for styling
- **State Management**: Zustand for efficient state management
- **Backend Integration**: Tauri for native desktop capabilities
- **Testing**: Vitest for unit tests, Playwright for E2E tests
- **Build System**: Vite for fast development and optimized builds

## Development Setup

### Prerequisites

- Node.js >= 22
- npm or pnpm
- Rust (for Tauri development)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/codex-desktop.git
cd codex-desktop
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

For Tauri development:
```bash
npm run tauri:dev
```

## Testing

The project uses a comprehensive testing strategy with both unit and E2E tests.

### Unit Tests (Vitest)

Run unit tests:
```bash
npm run test:unit
```

Run unit tests in watch mode:
```bash
npm run test:unit:watch
```

Run unit tests with UI:
```bash
npm run test:unit:ui
```

Generate coverage report:
```bash
npm run test:unit:coverage
```

### E2E Tests (Playwright)

Run E2E tests:
```bash
npm test
```

Run E2E tests with UI:
```bash
npm run test:ui
```

Run all tests (unit + E2E):
```bash
npm run test:all
```

## Build and Deployment

### Build for Production

```bash
npm run build
```

### Build Tauri Application

```bash
npm run tauri:build
```

The built application will be in `src-tauri/target/release/bundle/`.

## Project Structure

```
src/
├── components/          # React components
│   ├── chat/           # Chat-related components
│   ├── common/         # Shared UI components
│   └── settings/       # Settings components
├── stores/             # Zustand state management
│   ├── thread/         # Thread store with LRU cache
│   ├── app.ts          # App state
│   ├── settings.ts     # Settings state
│   └── ...
├── lib/                # Utility libraries
│   ├── api.ts          # API client
│   ├── types/          # TypeScript type definitions
│   └── exporters/      # Data export utilities
├── hooks/              # Custom React hooks
└── test/               # Test utilities and setup
```

## Key Components

### Thread Store with LRU Cache

The application implements an LRU (Least Recently Used) cache to manage thread data efficiently and prevent memory leaks:

```typescript
// Example usage
const cache = new LRUCache<string, ThreadData>(500) // Max 500 entries
cache.set('thread-1', threadData)
const data = cache.get('thread-1')
```

### Delta Buffer

Real-time streaming of AI responses with efficient buffering:

```typescript
// Handles streaming data with automatic batching
const buffer = new DeltaBuffer()
buffer.append(data)
buffer.flush() // Sends batched updates
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://ws.example.com
```

### TypeScript Configuration

The project uses TypeScript 5.9 with strict mode enabled. Configuration files:
- `tsconfig.json` - Base configuration
- `tsconfig.app.json` - Application-specific settings
- `tsconfig.node.json` - Node.js-specific settings

## Security Considerations

1. **Input Validation**: All user inputs are validated before processing
2. **Type Safety**: Strict TypeScript configuration prevents runtime errors
3. **Secure Communication**: WebSocket connections use secure protocols
4. **File System Access**: Limited through Tauri's permission system
5. **Error Handling**: Comprehensive error handling with user-friendly messages

## Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm run test:all`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Run `npm run lint` before committing
- Add JSDoc comments for public APIs

## Performance Optimization

The application includes several performance optimizations:

1. **LRU Cache**: Prevents memory leaks from unbounded growth
2. **React Window**: Virtual scrolling for large lists
3. **Zustand**: Efficient state updates with selective subscriptions
4. **Code Splitting**: Automatic code splitting with Vite
5. **Tree Shaking**: Dead code elimination in production builds

## Troubleshooting

### Common Issues

1. **Build Failures**: Ensure Node.js version is >= 22
2. **Tauri Build Issues**: Install Rust toolchain
3. **Test Failures**: Update dependencies with `npm update`

### Debug Mode

Enable debug logging:
```bash
DEBUG=codex:* npm run dev
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [React](https://react.dev/) for the UI framework
- [Tauri](https://tauri.app/) for desktop app framework
- [Vite](https://vite.dev/) for the build tool
- [Zustand](https://zustand.docs.pmnd.rs/) for state management
- [Tailwind CSS](https://tailwindcss.com/) for styling

## Support

For support, please open an issue on GitHub or contact the development team.