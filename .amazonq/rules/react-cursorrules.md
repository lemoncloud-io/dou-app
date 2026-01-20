# React + TypeScript Standards (Nx Monorepo)

Include: typescript-common.cursorrules

You are an expert React developer following Nx monorepo patterns with strict TypeScript conventions.

================================================================================
FOUNDATION
================================================================================

All core TypeScript principles from typescript-common.cursorrules apply:

- Type safety (no `any`, handle null/undefined)
- Early returns (no deep nesting)
- Named variables for complex conditions
- const + arrow functions only
- 5-second rule for naming
- Testability as quality measure
- Duplication > Complexity philosophy

This file covers React/Nx-specific patterns only.

================================================================================
NX MONOREPO ARCHITECTURE
================================================================================

## Project Structure

```
apps/
├── web/                      # Main application
│   └── src/
│       ├── features/         # Feature pages & components
│       │   └── products/
│       │       ├── components/
│       │       ├── hooks/
│       │       ├── pages/
│       │       └── routes/
│       └── shared/           # App-specific shared code
│
libs/
├── web-core/                 # Auth & foundation
├── shared/                   # Common utilities
├── ui-kit/                   # Shadcn components
└── {feature}/                # ⭐ FEATURE LIBRARY (Critical pattern)
    └── src/
        ├── apis/             # API functions (axios)
        │   └── index.ts
        ├── hooks/            # TanStack Query hooks
        │   └── index.ts
        ├── types/            # TypeScript types
        │   └── index.ts
        └── consts/           # Constants
            └── index.ts
```

================================================================================
FEATURE LIBRARY PATTERN (MOST IMPORTANT)
================================================================================

Every feature exports its API layer from `libs/{feature}/`:

```typescript
// libs/product/src/apis/index.ts
export const fetchProducts = async (params: Params): Promise<ListResult<ProductView>> => {
    const {data} = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${PRODUCTS_ENDPOINT}/products`,
        })
        .setParams({...params})
        .execute<ListResult<ProductView>>();

    return {...data};
};

export const createProduct = async (createBody: ProductFormData): Promise<ProductView> => {
    const response = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${PRODUCTS_ENDPOINT}/products/0`,
        })
        .setBody({...createBody})
        .execute<ProductView>();

    return response.data;
};

// libs/product/src/hooks/index.ts
import { fetchProducts, createProduct } from '../apis';
import { useQueryClient } from '@tanstack/react-query';
...

export const productsKeys = createQueryKeys('products');

export const useProducts = (params: Params) =>
    useQuery<PaginationType<ProductView[]>>({
        queryKey: productsKeys.list(params ?? {}),
        queryFn: async () => {
            const result = await fetchProducts(params);
            return {...result, data: result.list || []} as PaginationType<ProductView[]>;
        },
        refetchOnWindowFocus: false,
    })

export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productsKeys.all });
    }
  });
};

// libs/product/src/types/index.ts
import type {ProductBody, ProductView} from '@lemoncloud/lemon-products-api';
import type {ProductType} from '@lemoncloud/lemon-products-api/dist/service/backend-types';

export type CreateProductDTO = ProductBody;

export type UpdateProductDTO = {
    productId: string;
} & Partial<ProductFormData>;

export interface ProductFormData extends Partial<ProductView> {
    type: ProductType;
    title: string;
    maxImages: number;
    ...
}


// libs/product/src/index.ts (⭐ BARREL EXPORT - MANDATORY)
export * from './apis';
export * from './hooks';
export * from './types';
export * from './consts';
```

## Usage in Application

```typescript
// apps/web/src/features/products/pages/ProductList.tsx
import { useProducts, useCreateProduct, Product } from '@{projectName}/product';
import { Button } from '@{projectName}/ui-kit';

export const ProductListPage = () => {
  const { data: products, isLoading } = useProducts();
  const createMutation = useCreateProduct();

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      name: 'New Product',
      price: 100
    });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <Button onClick={handleCreate}>Add Product</Button>
      {products?.map(product => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
};
```

================================================================================
DATA FLOW - NO FACADE PATTERN
================================================================================

React uses direct hook composition, NOT facades (unlike Angular).

```
Component → Custom Hook → TanStack Query → API Function → Backend
```

```typescript
// ✅ GOOD - Direct hook usage
export const OrderPage = () => {
  const { data: orders } = useOrders();
  const createMutation = useCreateOrder();

  return <div>...</div>;
};

// ❌ BAD - Don't create unnecessary abstraction layers
export const OrderPage = () => {
  const orderFacade = useOrderFacade();  // ❌ Not React pattern
  return <div>...</div>;
};
```

================================================================================
STATE MANAGEMENT
================================================================================

## 1. Zustand - Global Client State

```typescript
// libs/web-core/src/stores/useWebCoreStore.ts
import { create } from 'zustand';

interface WebCoreState {
    isAuthenticated: boolean;
    profile: UserProfile | null;
    setProfile: (profile: UserProfile | null) => void;
}

export const useWebCoreStore = create<WebCoreState>(set => ({
    isAuthenticated: false,
    profile: null,
    setProfile: profile => set({ profile, isAuthenticated: !!profile }),
}));

// Usage
const { isAuthenticated, profile } = useWebCoreStore();
```

## 2. TanStack Query - Server State (in feature libs)

```typescript
// Already shown in Feature Library Pattern above
// Always in libs/{feature}/src/hooks/
```

## 3. useState - Local Component State

```typescript
const [isOpen, setIsOpen] = useState(false);
const [selectedId, setSelectedId] = useState<string | null>(null);
```

## 4. LocalStorage - Persistent State

```typescript
// libs/shared/src/hooks/useLocalStorage.ts
export const useLocalStorage = <T>(key: string, initialValue: T) => {
    const [value, setValue] = useState<T>(() => {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
    });

    const setStoredValue = (newValue: T) => {
        setValue(newValue);
        localStorage.setItem(key, JSON.stringify(newValue));
    };

    return [value, setStoredValue] as const;
};
```

================================================================================
CUSTOM HOOKS COMPOSITION
================================================================================

Compose hooks for complex logic (NOT facades):

```typescript
// ✅ GOOD - Hook composition
export const useProductManagement = (productId: string) => {
    const { data: product, isLoading } = useProduct(productId);
    const updateMutation = useUpdateProduct();
    const deleteMutation = useDeleteProduct();
    const { toast } = useToast();
    const navigate = useNavigate();

    const handleUpdate = async (data: UpdateProductDto) => {
        try {
            await updateMutation.mutateAsync({ id: productId, data });
            toast({ title: 'Product updated' });
        } catch (error) {
            toast({ title: 'Failed', variant: 'destructive' });
        }
    };

    const handleDelete = async () => {
        try {
            await deleteMutation.mutateAsync(productId);
            toast({ title: 'Deleted' });
            navigate('/products');
        } catch (error) {
            toast({ title: 'Failed', variant: 'destructive' });
        }
    };

    return {
        product,
        isLoading: isLoading || updateMutation.isPending || deleteMutation.isPending,
        handleUpdate,
        handleDelete,
    };
};
```

================================================================================
COMPONENT PATTERNS
================================================================================

```typescript
interface ProductCardProps {
  product: Product;
  onEdit?: (product: Product) => void;
  onDelete?: (id: string) => void;
}

export const ProductCard = ({ product, onEdit, onDelete }: ProductCardProps) => {
  // 1. Hooks
  const { toast } = useToast();
  const updateMutation = useUpdateProduct();

  // 2. Derived state
  const isOutOfStock = product.stock === 0;
  const displayPrice = `$${product.price.toFixed(2)}`;

  // 3. Event handlers
  const handleEdit = () => {
    onEdit?.(product);
  };

  const handleQuickUpdate = async () => {
    try {
      await updateMutation.mutateAsync({
        id: product.id,
        data: { stock: 10 }
      });
      toast({ title: 'Stock updated' });
    } catch (error) {
      toast({ title: 'Failed', variant: 'destructive' });
    }
  };

  // 4. Render
  return (
    <Card>
      <CardHeader>
        <CardTitle>{product.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn(isOutOfStock && 'text-red-500')}>
          Stock: {product.stock}
        </p>
        <p>{displayPrice}</p>
      </CardContent>
      <CardFooter>
        <Button onClick={handleEdit}>Edit</Button>
        <Button onClick={handleQuickUpdate}>Restock</Button>
      </CardFooter>
    </Card>
  );
};
```

================================================================================
SHADCN UI + TAILWIND
================================================================================

```typescript
import { cn } from '@{projectName}/ui-kit';

// ✅ Use cn() for class merging
<Button
  className={cn(
    'w-full',
    isLoading && 'opacity-50 cursor-not-allowed',
    variant === 'primary' && 'bg-blue-500'
  )}
>
  Submit
</Button>

// ✅ Always use Shadcn components
import { Button, Dialog, Input, Card } from '@{projectName}/ui-kit';

// ❌ Don't create custom styled components
const StyledButton = styled.button`...`;  // ❌
```

================================================================================
BARREL EXPORTS (MANDATORY)
================================================================================

Every folder MUST have `index.ts`:

```typescript
// libs/product/src/apis/index.ts
export * from './products';
export * from './categories';

// libs/product/src/hooks/index.ts
export * from './useProducts';
export * from './useCategories';

// libs/product/src/index.ts (Root barrel - CRITICAL)
export * from './apis';
export * from './hooks';
export * from './types';
export * from './consts';
```

## Import Rules

```typescript
// ✅ GOOD - Use workspace aliases
import { useProducts, Product } from '@{projectName}/product';
import { Button } from '@{projectName}/ui-kit';

// ❌ BAD - Relative imports across libraries
import { useProducts } from '../../../product/src/hooks/useProducts';

// ❌ BAD - Deep imports
import { useProducts } from '@{projectName}/product/src/hooks/useProducts';
```

================================================================================
AUTH PATTERN (PROJECT-SPECIFIC)
================================================================================

```typescript
import { useWebCoreStore, useInitWebCore, useTokenRefresh } from '@{projectName}/web-core';

export const App = () => {
  const isInitialized = useInitWebCore();
  const { isAuthenticated } = useWebCoreStore();

  useTokenRefresh(isInitialized);

  if (!isInitialized) return <GlobalLoader />;

  return isAuthenticated ? <MainApp /> : <LoginPage />;
};

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useWebCoreStore();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
};
```

================================================================================
ANTI-OVER-ENGINEERING (WET > DRY)
================================================================================

## Component Size Guidelines

**Keep components simple and focused:**

- **~200 lines per component**: Consider splitting if exceeded
- **~5 business props healthy**: 10+ props is a smell
- **No mega-components**: Avoid 500+ line components with conditional branches
- **Garden over Pyramid**: Simple, self-contained components that grow independently

## Intentional Duplication OK

```typescript
// ✅ GOOD: Two simple components
export const UserCard = ({ user }: { user: User }) => (
  <Card>
    <Avatar src={user.avatar} />
    <Text>{user.name}</Text>
  </Card>
);

export const UserListItem = ({ user }: { user: User }) => (
  <ListItem>
    <Avatar src={user.avatar} size="sm" />
    <Text>{user.name}</Text>
  </ListItem>
);

// ❌ BAD: One complex conditional component
export const UserDisplay = ({
  user,
  variant,
  showAvatar,
  avatarSize,
  showBio,
  showStats,
  ...props
}: UserDisplayProps) => {
  // 100+ lines of conditional logic trying to handle every case
  if (variant === 'card') {
    // Card rendering logic
  } else if (variant === 'list') {
    // List rendering logic
  }
  // More complexity...
};
```

## Guidelines

- **2 simple > 1 complex**: Prefer two simple components over one mega-component
- **Intentional duplication**: If it preserves clarity, duplication is acceptable
- **Extract when needed**: But don't create abstractions "just in case"
- **Focus on maintainability**: Will this be easy to understand in 6 months?

================================================================================
ANTI-PATTERNS (FORBIDDEN)
================================================================================

```typescript
// ❌ Creating facade layers
export const useOrderFacade = () => { };  // ❌

// ❌ Relative imports across libraries
import { useProducts } from '../../../product/src/hooks';

// ❌ Mixing API and UI concerns
export const getOrders = async () => {
  const data = await axios.get('/orders');
  toast.success('Loaded');  // ❌
  return data;
};

// ❌ Not using barrel exports
import { useProducts } from '@{projectName}/product/src/hooks/useProducts';

// ❌ Class components
class MyComponent extends React.Component { }

// ❌ Inline styles
<div style={{ color: 'red' }}>  // ❌

// ❌ Default exports/imports (FORBIDDEN in this project)
export default UserCard;                    // ❌
import UserCard from './UserCard';          // ❌

// ✅ ALWAYS use named exports/imports
export const UserCard = () => { };          // ✅
import { UserCard } from './UserCard';      // ✅

// ❌ Mega-component with too many props
export const UserDisplay = ({
  user,
  variant,
  size,
  showAvatar,
  showBio,
  showStats,
  showActions,
  onEdit,
  onDelete,
  onShare,
  ...props
}: UserDisplayProps) => {
  // 500+ lines of conditional logic
};

// ✅ Split into focused components
export const UserCard = ({ user, onEdit }: UserCardProps) => { /* ... */ };
export const UserListItem = ({ user, onSelect }: UserListItemProps) => { /* ... */ };

// ❌ useState for shared state
const [user, setUser] = useState<User>();  // Shared across components

// ✅ Zustand for shared state
export const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

// ❌ Passing setState as props
<Child setData={setData} />

// ✅ Pass handler functions
<Child onAddItem={handleAddItem} />
```

================================================================================
VERIFICATION COMMANDS
================================================================================

Before committing React code:

```bash
# Type checking
npm run typecheck    # or: tsc --noEmit

# Linting
npm run lint

# Tests
npm test -- --watchAll=false
```

**All commands must pass before submitting code.**

================================================================================
WHEN I WRITE REACT CODE FOR YOU
================================================================================

I will ALWAYS:

1. Use feature library structure (libs/{feature}/src/apis, hooks, types)
2. Create barrel exports (index.ts) everywhere
3. Use @{projectName}/\* workspace aliases
4. Follow Component → Hook → API pattern
5. Use TanStack Query for server state
6. Use Zustand for global client state
7. Use Shadcn components with cn()
8. Apply all TypeScript rules from typescript-common
9. Keep components ~200 lines or less
10. Limit business props to ~5 (10+ is a smell)
11. Prefer 2 simple components over 1 complex component
12. Run verification commands before committing

I will NEVER:

1. Create facade classes
2. Use relative imports across libs
3. Mix concerns (API + UI)
4. Bypass barrel exports
5. Use class components
6. Use inline styles
7. Use default exports/imports (always named exports)
8. Create mega-components (500+ lines with many props)
9. Use useState for shared state (use Zustand)
10. Pass setState as props (pass handler functions)
11. Violate any typescript-common rules

When you ask me to create React code, I will follow these patterns exactly.
