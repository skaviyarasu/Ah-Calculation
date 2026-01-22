# Supabase Configuration Map

## 📍 Main Configuration File

### `src/lib/supabase.js`
**This is the central Supabase configuration file**

```javascript
// Lines 1-18: Supabase Client Setup
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  { auth: {...}, realtime: {...} }
)
```

**Location**: `src/lib/supabase.js`

**What it exports:**
- `supabase` - Main Supabase client
- `db` - Database helper functions (jobs, cell data)
- `auth` - Authentication helper functions
- `rbac` - Role-based access control functions
- `organization` - Organization & branch functions
- `inventory` - Inventory management functions
- `accounting` - Accounting system functions

---

## 🔗 Where Supabase is Imported

### Main Application Files:

1. **`src/App.jsx`** (Main AH Balancer component)
   ```javascript
   import { db, auth, supabase, rbac } from "./lib/supabase";
   ```
   - Uses: `db` (save/load jobs), `auth` (user), `supabase` (direct queries), `rbac` (permissions)

2. **`src/LoginGate.jsx`** (Authentication wrapper)
   ```javascript
   import { auth, supabase, inventory } from './lib/supabase';
   ```
   - Uses: `auth` (login/signup), `supabase` (session management), `inventory` (check access)

3. **`src/MainApp.jsx`** (Main app router)
   - Imports components that use Supabase

### Component Files:

4. **`src/components/AdminPanel.jsx`**
   ```javascript
   import { rbac, auth, organization } from '../lib/supabase';
   ```
   - Uses: User management, role assignment, organizations

5. **`src/components/InventoryManagement.jsx`**
   ```javascript
   import { inventory, auth, rbac } from '../lib/supabase';
   ```
   - Uses: Inventory operations, permissions

6. **`src/components/ContactsModule.jsx`**
   ```javascript
   import { accounting, auth } from '../lib/supabase';
   ```

7. **`src/components/InvoicingModule.jsx`**
   ```javascript
   import { accounting, inventory } from '../lib/supabase';
   ```

8. **`src/components/PurchasesModule.jsx`**
   ```javascript
   import { accounting, inventory, auth } from '../lib/supabase';
   ```

9. **`src/components/SalesManagement.jsx`**
   ```javascript
   import { inventory, accounting } from '../lib/supabase';
   ```

10. **`src/components/PLDashboard.jsx`**
    ```javascript
    import { inventory } from '../lib/supabase';
    ```

11. **`src/components/AccountsModule.jsx`**
    ```javascript
    import { accounting } from '../lib/supabase';
    ```

12. **`src/components/UserRegistration.jsx`**
    ```javascript
    import { auth, supabase } from '../lib/supabase';
    ```

### Hook Files:

13. **`src/hooks/useRole.js`**
    ```javascript
    import { rbac, auth } from '../lib/supabase';
    ```
    - Provides role checking functionality

14. **`src/hooks/useBranch.js`**
    ```javascript
    import { auth, organization } from '../lib/supabase';
    ```
    - Provides branch selection functionality

---

## 🔧 Environment Variables

### Where Variables Are Read:
- **File**: `src/lib/supabase.js` (lines 4-5)
- **Variables**:
  - `VITE_SUPABASE_URL` → Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` → Supabase anonymous/public key

### Where Variables Are Set:
- **Local Development**: `.env.local` file (in project root)
- **Vercel Deployment**: Vercel Dashboard → Settings → Environment Variables

---

## 📊 Supabase Usage by Module

### Authentication (`auth`)
- **Used in**: `LoginGate.jsx`, `App.jsx`, `UserRegistration.jsx`
- **Functions**: `signUp()`, `signIn()`, `signOut()`, `getCurrentUser()`

### Database Operations (`db`)
- **Used in**: `App.jsx`
- **Functions**: `createJob()`, `getUserJobs()`, `updateJob()`, `deleteJob()`, `saveCellData()`, `getCellData()`

### Role-Based Access (`rbac`)
- **Used in**: `App.jsx`, `AdminPanel.jsx`, `InventoryManagement.jsx`, `useRole.js`
- **Functions**: `getUserRole()`, `hasRole()`, `isAdmin()`, `hasPermission()`

### Organizations (`organization`)
- **Used in**: `AdminPanel.jsx`, `useBranch.js`
- **Functions**: `getOrganizations()`, `getBranches()`, `getUserBranches()`

### Inventory (`inventory`)
- **Used in**: `InventoryManagement.jsx`, `SalesManagement.jsx`, `PLDashboard.jsx`
- **Functions**: `getAllItems()`, `createItem()`, `createTransaction()`, etc.

### Accounting (`accounting`)
- **Used in**: `ContactsModule.jsx`, `InvoicingModule.jsx`, `PurchasesModule.jsx`, `AccountsModule.jsx`
- **Functions**: `getAllContacts()`, `createInvoice()`, `createPurchaseOrder()`, etc.

---

## 🗂️ File Structure

```
src/
├── lib/
│   └── supabase.js          ← MAIN CONFIGURATION (all Supabase setup here)
├── App.jsx                  ← Uses: db, auth, supabase, rbac
├── LoginGate.jsx            ← Uses: auth, supabase, inventory
├── MainApp.jsx              ← App router
├── hooks/
│   ├── useRole.js          ← Uses: rbac, auth
│   └── useBranch.js        ← Uses: auth, organization
└── components/
    ├── AdminPanel.jsx       ← Uses: rbac, auth, organization
    ├── InventoryManagement.jsx ← Uses: inventory, auth, rbac
    ├── ContactsModule.jsx   ← Uses: accounting, auth
    ├── InvoicingModule.jsx  ← Uses: accounting, inventory
    ├── PurchasesModule.jsx ← Uses: accounting, inventory, auth
    ├── SalesManagement.jsx  ← Uses: inventory, accounting
    ├── PLDashboard.jsx     ← Uses: inventory
    ├── AccountsModule.jsx  ← Uses: accounting
    └── UserRegistration.jsx ← Uses: auth, supabase
```

---

## 🔍 Key Points

1. **Single Source of Truth**: All Supabase configuration is in `src/lib/supabase.js`
2. **Environment Variables**: Read from `import.meta.env.VITE_*` (Vite's way)
3. **Modular Exports**: Different modules exported for different features
4. **Centralized**: All components import from the same file

---

## 🛠️ To Change Supabase Configuration

**Only edit**: `src/lib/supabase.js`

**To change URL/Key**: Update environment variables in:
- `.env.local` (local development)
- Vercel Dashboard (production)

