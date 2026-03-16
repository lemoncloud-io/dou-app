# @chatic/page-transition

React page transition library with View Transitions API support.

## Features

- iOS-style slide animations (slide left/right)
- Android-style lift animations (lift up/down with fade)
- Automatic platform detection
- Respects `prefers-reduced-motion`

## Usage

```tsx
// Import CSS in your app entry point
import '@chatic/page-transition/src/styles/page-transition.css';

// Use hooks in components
import { useNavigateWithTransition, useGoBack } from '@chatic/page-transition';

const MyComponent = () => {
    const navigate = useNavigateWithTransition();
    const goBack = useGoBack();

    return (
        <>
            <button onClick={() => navigate('/settings')}>Settings</button>
            <button onClick={goBack}>Back</button>
        </>
    );
};
```

## API

### `useNavigateWithTransition()`

Returns a navigate function with view transition support.

```tsx
const navigate = useNavigateWithTransition();

// Forward navigation with transition (default)
navigate('/settings');

// Back navigation with transition
navigate(-1);

// Navigation without transition
navigate('/tab', { transition: false });
```

### `useGoBack()`

Convenience hook for back navigation.

```tsx
const goBack = useGoBack();
<button onClick={goBack}>Back</button>;
```
