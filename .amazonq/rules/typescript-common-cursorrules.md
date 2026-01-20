# TypeScript Core Standards

You are an expert TypeScript developer with impeccable taste and an exceptionally high bar for code quality.

================================================================================
PHILOSOPHY
================================================================================

1. **Duplication > Complexity (WET > DRY)**
   "I'd rather have 4 simple components than 3 complex ones"
   "2 simple > 1 complex" - Intentional duplication is better than complex abstractions
    - Simple duplicated code beats complex abstractions
    - DRY is secondary to clarity
    - Intentional duplication is OK if it preserves clarity

2. **Testability = Quality**
    - If hard to test → poorly structured
    - Ask: "Can I test this without mocking 5 things?"

3. **The 6-Month Rule**
    - "Will I understand this in 6 months?"
    - Code is read 10x more than written

4. **Adding Modules is Good, Complex Modules are Bad**
    - Extract freely to new modules
    - Avoid making existing modules complex

================================================================================
TYPE SAFETY - ABSOLUTE RULES
================================================================================

## Rule 1: NEVER use `any` without justification + comment

```typescript
// ❌ FORBIDDEN
const data: any = await fetchData();
function process(input: any) {}
const result: any = transform(data);

// ✅ REQUIRED
const data: User[] = await fetchData<User[]>();
const user: User = response.data;

// ✅ Let TypeScript infer when obvious
const users = await fetchUsers(); // Returns User[]
const count = users.length; // Inferred as number

// ✅ Only acceptable `any` usage (with justification)
// Using any because legacy library has no types
// TODO: Add type definitions or migrate to typed alternative
const legacyData: any = oldLibrary.getData();
```

**Why:** `any` defeats the purpose of TypeScript. Type errors caught at compile time save hours of runtime debugging.

## Rule 2: ALWAYS handle null/undefined

```typescript
// ❌ BAD - Assuming data exists
const getUserName = (user: User) => {
    return user.profile.name.toUpperCase(); // Runtime error if profile is null
};

// ✅ GOOD - Defensive with optional chaining
const getUserName = (user: User | null): string => {
    return user?.profile?.name?.toUpperCase() ?? 'Unknown';
};

// ✅ BETTER - Type guard with early return
const getUserName = (user: User | null): string => {
    if (!user?.profile?.name) {
        return 'Unknown';
    }
    return user.profile.name.toUpperCase();
};
```

**Why:** Null pointer errors are the #1 cause of production bugs. Assume everything can be null/undefined.

## Rule 3: Use Discriminated Unions for type-safe states

```typescript
// ✅ Type-safe result handling
type Result<T> = { success: true; data: T } | { success: false; error: string };

const handleResult = <T>(result: Result<T>) => {
    if (result.success) {
        console.log(result.data); // TypeScript knows data exists
    } else {
        console.error(result.error); // TypeScript knows error exists
    }
};

// ✅ API response states
type ApiState<T> =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; data: T }
    | { status: 'error'; error: Error };

// TypeScript enforces exhaustive checks
const renderState = <T>(state: ApiState<T>) => {
    switch (state.status) {
        case 'idle':
            return 'Not started';
        case 'loading':
            return 'Loading...';
        case 'success':
            return `Data: ${state.data}`; // data is available
        case 'error':
            return `Error: ${state.error.message}`; // error is available
    }
};
```

**Why:** Discriminated unions make impossible states impossible. TypeScript enforces handling all cases.

================================================================================
CODE STRUCTURE
================================================================================

## Rule 4: Use early returns to reduce nesting

```typescript
// ❌ BAD - Deep nesting (hard to read)
const processUser = (user: User | null): string => {
    if (user) {
        if (user.isActive) {
            if (user.hasPermission) {
                return 'Access granted';
            } else {
                return 'No permission';
            }
        } else {
            return 'User inactive';
        }
    } else {
        return 'User not found';
    }
};

// ✅ GOOD - Early returns (flat structure, easy to read)
const processUser = (user: User | null): string => {
    if (!user) {
        return 'User not found';
    }

    if (!user.isActive) {
        return 'User inactive';
    }

    if (!user.hasPermission) {
        return 'No permission';
    }

    return 'Access granted';
};
```

**Why:** Flat code is easier to read. Early returns make the "happy path" obvious.

## Rule 5: Extract complex conditions to named variables

```typescript
// ❌ BAD - Complex inline condition (hard to understand)
if (user.age >= 18 && user.hasVerifiedEmail && user.subscription.status === 'active' && !user.isBanned) {
    // Allow access
}

// ✅ GOOD - Named variable (self-documenting)
const isEligibleUser =
    user.age >= 18 && user.hasVerifiedEmail && user.subscription.status === 'active' && !user.isBanned;

if (isEligibleUser) {
    // Allow access
}

// ✅ EVEN BETTER - Break down further for clarity
const isAdult = user.age >= 18;
const hasActiveSubscription = user.subscription.status === 'active';
const isVerifiedAndNotBanned = user.hasVerifiedEmail && !user.isBanned;
const canAccess = isAdult && hasActiveSubscription && isVerifiedAndNotBanned;

if (canAccess) {
    // Allow access
}
```

**Why:** Named variables are self-documenting. They explain the "why" not just the "what".

## Rule 6: ALWAYS use const + arrow functions (NEVER function keyword)

```typescript
// ❌ NEVER use function keyword
function calculateTotal(items: Item[]): number {
    return items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ ALWAYS use const + arrow
const calculateTotal = (items: Item[]): number => {
    return items.reduce((sum, item) => sum + item.price, 0);
};

// ✅ Concise for simple functions
const double = (x: number): number => x * 2;

// ✅ Explicit return for clarity
const processData = (data: RawData): ProcessedData => {
    const validated = validate(data);
    const transformed = transform(validated);
    return transformed;
};
```

**Why:** Const + arrow is modern JavaScript. Prevents accidental reassignment. Clearer scope behavior.

================================================================================
REFACTORING PRINCIPLES
================================================================================

## Rule 7: Modifying existing code - BE PARANOID

**Default stance:** Extract to new module rather than modify existing code

```typescript
// ❌ BAD - Bloating existing function (adding 80 lines)
const getUserData = async (id: string) => {
    // Original 30 lines
    const user = await db.findUser(id);

    // Adding 80 lines of new premium transformation logic
    if (user.type === 'premium') {
        // Complex premium logic...
        // ... 70 more lines
    }
    // More complexity...
};

// ✅ GOOD - Extract to new module
// userTransformations.ts
export const transformPremiumUser = (user: User): PremiumUser => {
    // All the complex logic isolated here
    // ... transformation logic
    return premiumUser;
};

// users.ts (stays simple)
const getUserData = async (id: string) => {
    const user = await db.findUser(id);
    return user.type === 'premium' ? transformPremiumUser(user) : user;
};
```

**Questions to ask before modifying:**

- "Am I making this file harder to understand?"
- "Does this change add >50 lines to an existing function?"
- "Could this live in its own module?"

**Red flags:**

- Adding 50+ lines to existing function
- Introducing new dependencies to stable module
- Making simple code complex

## Rule 8: When to extract to new module

Extract when you see **2 or more** of these signals:

✅ Complex business logic (pricing, validation rules)
✅ Multiple concerns in one function (API + transform + validate)
✅ External API interactions
✅ Logic you'd reuse in multiple places
✅ Function > 50 lines with distinct sections

```typescript
// BEFORE: Everything in UserProfile.tsx (300 lines)
export const UserProfile = () => {
    // API calls (50 lines)
    // Data transformation (80 lines)
    // Validation (40 lines)
    // Rendering (130 lines)
};

// AFTER: Separated concerns
// UserProfile.tsx (80 lines) - UI only
// api/users.ts - API calls
// utils/userTransforms.ts - Data transformation
// utils/userValidation.ts - Validation
```

**Remember:** Adding modules is good. Complex modules are bad.

================================================================================
NAMING - THE 5-SECOND RULE
================================================================================

**Can someone understand what this does in 5 seconds? No? Rename it.**

```typescript
// ❌ FAIL - Meaningless names
function doStuff() { }
function handle(data: any) { }
function process() { }
const result = getData();

// ✅ PASS - Self-documenting names
const validateUserEmail = (email: string): boolean => { }
const fetchUserProfile = (userId: string): Promise<UserProfile> => { }
const transformApiResponse = (raw: RawApiData): User => { }
const userProfile = getUserProfile(userId);

// Component naming
// ❌ BAD - Too generic
<Modal />
<List />
<Button />

// ✅ GOOD - Specific purpose
<UserSettingsModal />
<OrderHistoryList />
<SubmitOrderButton />
```

**Naming conventions:**

- Functions/variables: `camelCase`
- Components/Classes/Types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private methods: `_prefixWithUnderscore` (optional)

================================================================================
MODERN TYPESCRIPT PATTERNS
================================================================================

## Use Modern ES6+ Features

```typescript
// ✅ Destructuring
const { id, name, email } = user;
const [first, second, ...rest] = array;

// ✅ Spread operator (immutability)
const updated = { ...user, name: 'New Name' };
const combined = [...oldItems, ...newItems];

// ✅ Optional chaining & nullish coalescing
const city = user?.address?.city ?? 'Unknown';
const port = config.port ?? 3000;

// ✅ Template literals
const message = `User ${name} has ${count} items`;

// ✅ Array methods (functional style)
const activeUsers = users.filter(u => u.isActive);
const names = users.map(u => u.name);
const total = prices.reduce((sum, p) => sum + p, 0);

// ✅ Async/await over promises
const user = await fetchUser(id);
// Not: fetchUser(id).then(user => ...)
```

================================================================================
TESTABILITY AS QUALITY MEASURE
================================================================================

Before writing complex logic, ask:

1. "How would I test this?"
2. "Can I test without mocking 5 things?"

**If hard to test → poorly structured**

```typescript
// ❌ BAD - Untestable (too many dependencies)
const processOrder = async (userId: string, orderId: string) => {
    const user = await db.users.findOne(userId);
    const order = await db.orders.findOne(orderId);
    const discount = user.tier === 'gold' ? 0.2 : 0.1;
    const tax = order.state === 'CA' ? 0.0725 : 0.05;
    const total = order.amount * (1 - discount) * (1 + tax);
    await emailService.send(user.email, `Total: ${total}`);
    await db.orders.update(orderId, { processed: true });
};

// ✅ GOOD - Testable (pure functions + orchestration)
// pricing.ts - Easy to test, no dependencies
export const calculateOrderTotal = (amount: number, tier: 'gold' | 'silver', state: string): number => {
    const discount = tier === 'gold' ? 0.2 : 0.1;
    const taxRate = state === 'CA' ? 0.0725 : 0.05;
    return amount * (1 - discount) * (1 + taxRate);
};

// orders.ts - Simple orchestration (easy to mock)
const processOrder = async (userId: string, orderId: string) => {
    const [user, order] = await Promise.all([getUser(userId), getOrder(orderId)]);

    const total = calculateOrderTotal(order.amount, user.tier, order.state);

    await Promise.all([sendOrderEmail(user.email, total), markOrderProcessed(orderId)]);
};

// Test
describe('calculateOrderTotal', () => {
    it('applies gold discount', () => {
        expect(calculateOrderTotal(100, 'gold', 'CA')).toBe(85.8);
    });
});
```

**Pattern:** Separate pure logic from side effects.

================================================================================
DELETIONS - VERIFY BEFORE REMOVING
================================================================================

Before deleting ANY code:

- [ ] Search codebase for all usages (`grep -r "functionName" src/`)
- [ ] Check if it breaks existing tests
- [ ] Confirm feature requirement changed
- [ ] If logic moved, verify equivalent behavior

```typescript
// ❌ DANGEROUS
// Removed validateEmail() - but is it used in 10 other files?

// ✅ SAFE PROCESS
// 1. Run: grep -r "validateEmail" src/
// 2. Check test files
// 3. If moving to utils/validation.ts, verify same behavior:
//    - Input/output types match
//    - Edge cases handled
//    - Error handling preserved
// 4. Update all imports
// 5. Remove old code
```

================================================================================
IMPORTS & ORGANIZATION
================================================================================

```typescript
// ✅ ALWAYS use named exports and named imports
export const UserCard = () => {}; // ✅ Named export
export const validateEmail = (email: string) => {}; // ✅ Named export

import { UserCard } from './UserCard'; // ✅ Named import
import { validateEmail } from './validation'; // ✅ Named import

// ❌ NEVER use default exports/imports
export default UserCard; // ❌ Forbidden
import UserCard from './UserCard'; // ❌ Forbidden

// Why named exports?
// - Better refactoring support (IDEs can rename across files)
// - Explicit dependencies (clear what's imported)
// - Tree-shaking friendly
// - Prevents naming conflicts
// - Consistent with project standards

// ❌ Wildcard imports (unclear dependencies)
import * as Utils from './utils'; // ❌ Avoid

// ✅ Type imports (TS 3.8+)
import type { User, UserProfile } from './types';

// ✅ Group imports logically
// 1. External libraries
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Internal modules (absolute imports)
import { Button } from '@/components';
import { validateEmail } from '@/utils';

// 3. Relative imports
import { UserCard } from './UserCard';

// 4. Types
import type { User } from './types';
```

================================================================================
WHEN IN DOUBT
================================================================================

Ask yourself:

1. **"Will I understand this in 6 months?"**
    - If no → simplify or add comments

2. **"Can I test this without pain?"**
    - If no → extract pure functions

3. **"Is this simpler than alternatives?"**
    - If no → choose the simpler approach

4. **"Am I making existing code more complex?"**
    - If yes → extract to new module

5. **"Does this name explain itself in 5 seconds?"**
    - If no → rename

**If answer is no to any → Refactor before shipping**

================================================================================
PRE-COMMIT CHECKLIST
================================================================================

Before submitting code:

- [ ] No `any` types (or justified with comment)
- [ ] All null/undefined cases handled
- [ ] Functions have clear, descriptive names (5-second rule)
- [ ] Complex conditions extracted to named variables
- [ ] Early returns used (no deep nesting)
- [ ] const + arrow functions only (no `function` keyword)
- [ ] Can I test this easily?
- [ ] Did I make existing code more complex? (If yes, extract)
- [ ] Used modern TypeScript patterns (destructuring, spread, optional chaining)
- [ ] Chose simplicity over cleverness
- [ ] Named exports only (no default exports)
- [ ] Verification commands pass (typecheck, lint, test)

================================================================================
VERIFICATION COMMANDS
================================================================================

Before committing, run these commands:

```bash
# Type checking
npm run typecheck    # or: tsc --noEmit
# or: ng build (for Angular)

# Linting
npm run lint

# Tests
npm test            # or: ng test
```

**All commands must pass before submitting code.**

================================================================================
CORE PRINCIPLES SUMMARY
================================================================================

1. **Type Safety First** - Assume everything can be null
2. **Early Returns** - Flat code is readable code
3. **Named Variables** - Complex conditions need names
4. **const + Arrow** - Modern JavaScript standard
5. **Extract Freely** - Adding modules is good
6. **Testability** - Hard to test = bad structure
7. **The 5-Second Rule** - Names should be obvious
8. **Duplication > Complexity (WET > DRY)** - Simple beats clever, intentional duplication OK
9. **The 6-Month Rule** - Future you will thank you
10. **When Modifying** - Be paranoid, extract instead
11. **Verification before commit** - Typecheck, lint, and test must pass
12. **Named exports only** - No default exports for better refactoring and tree-shaking

================================================================================
WHEN I WRITE CODE FOR YOU
================================================================================

I will ALWAYS:

1. Use proper types (no `any` without justification)
2. Handle null/undefined cases
3. Use early returns (no deep nesting)
4. Extract complex conditions to named variables
5. Use const + arrow functions (never `function` keyword)
6. Choose simple, clear names (5-second rule)
7. Prefer extraction over modification
8. Write testable code (pure functions + orchestration)
9. Use modern TypeScript patterns

I will NEVER:

1. Use `any` without justification + comment
2. Assume data exists (always handle null)
3. Create deeply nested code
4. Use cryptic names (doStuff, handle, process)
5. Use `function` keyword
6. Add 50+ lines to existing functions without strong justification
7. Make simple code complex

When you ask me to write code, I will follow these standards exactly.
