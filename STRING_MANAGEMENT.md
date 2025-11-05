# String Management System

## Overview

RavenLoom uses a centralized string management system to ensure consistency across the application and prepare for future internationalization (i18n).

## Location

All user-facing strings are defined in:
```
frontend/src/strings.js
```

## Usage

### Basic Usage

Import the strings object and reference strings directly:

```javascript
import strings from './strings.js';

function MyComponent() {
  return <h1>{strings.app.name}</h1>;
}
```

### Strings with Parameters

Some strings are functions that accept parameters:

```javascript
import strings from './strings.js';

function Footer() {
  const year = new Date().getFullYear();
  return <div>{strings.footer.copyright(year)}</div>;
}
```

### Helper Functions

The module exports two helper functions:

#### getString(path)
Get a string using dot notation:
```javascript
import { getString } from './strings.js';

const errorMsg = getString('auth.errors.popupBlocked');
```

#### formatString(template, ...args)
Format a string with parameters:
```javascript
import { formatString, strings } from './strings.js';

const copyrightText = formatString(strings.footer.copyright, 2025);
```

## String Categories

### App Branding
- `strings.app.name` - Application name
- `strings.app.tagline` - Main tagline
- `strings.app.description` - Full description for meta tags

### Company Info
- `strings.company.name` - Legal entity name
- `strings.company.supportEmail` - Support email address

### Footer
- `strings.footer.copyright(year)` - Copyright text with year
- `strings.footer.privacyLink` - Privacy policy link text
- `strings.footer.termsLink` - Terms of service link text

### Authentication
- `strings.auth.*` - All authentication-related strings
- `strings.auth.errors.*` - Authentication error messages

### Projects & Tasks
- `strings.projects.*` - Project-related strings
- `strings.tasks.*` - Task-related strings

### Common UI
- `strings.common.*` - Common UI elements (buttons, labels, etc.)

## Best Practices

### DO:
✅ Add all new user-facing strings to `strings.js`
✅ Use descriptive, hierarchical keys (e.g., `auth.errors.popupBlocked`)
✅ Group related strings together
✅ Use functions for strings that need parameters
✅ Keep strings concise and clear

### DON'T:
❌ Hardcode user-facing strings in components
❌ Use strings for internal/debug messages (those can stay hardcoded)
❌ Duplicate strings - reuse existing ones when possible
❌ Mix languages in the same file (all English for now)

## Adding New Strings

1. Open `frontend/src/strings.js`
2. Find the appropriate category or create a new one
3. Add your string with a descriptive key
4. Import and use in your component

Example:
```javascript
// In strings.js
export const strings = {
  // ... existing strings
  dashboard: {
    welcome: 'Welcome to RavenLoom',
    loading: 'Loading your dashboard...',
  },
};

// In your component
import strings from './strings.js';

function Dashboard() {
  return <h1>{strings.dashboard.welcome}</h1>;
}
```

## Future: Internationalization (i18n)

When we're ready to add multi-language support:

1. Install an i18n library (e.g., `react-i18next`)
2. Convert `strings.js` to translation files (e.g., `en.json`, `es.json`)
3. Replace direct imports with i18n hooks:
   ```javascript
   // Current
   import strings from './strings.js';
   <h1>{strings.app.name}</h1>

   // Future with i18n
   import { useTranslation } from 'react-i18next';
   const { t } = useTranslation();
   <h1>{t('app.name')}</h1>
   ```

Since all strings are already centralized, this migration will be straightforward.

## Migration Status

### Completed ✅
- `frontend/src/App.jsx` - Tagline
- `frontend/src/Footer.jsx` - Copyright and links

### To Do 📝
- `frontend/src/Login.jsx` - Authentication strings
- `frontend/src/Header.jsx` - Navigation strings
- `frontend/src/ProjectDashboard.jsx` - Project management strings
- Other components as they're created/updated

## Testing

After modifying strings, always:
1. Check the app in the browser
2. Verify all strings render correctly
3. Test with different screen sizes (mobile/desktop)
4. Push to production and verify there

## Questions?

Contact the development team if you need help with string management or have questions about adding new strings.
