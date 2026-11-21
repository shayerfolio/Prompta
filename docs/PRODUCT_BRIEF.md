# MASTER BUILD PROMPT
## Project: Personal AI Prompt Library
### Phase 1 — Premium Web Application
### Based on Product Blueprint V0.6

---

# 1. YOUR ROLE

Act as a senior full-stack software engineer, principal UI/UX designer, frontend animation specialist, and product architect.

Your task is to design, develop, test, and deliver a **complete, beautiful, production-ready personal AI Prompt Library web application**.

This must not look like a generic AI-generated dashboard.

The application must feel like a carefully designed premium consumer product, inspired by the usability, simplicity, friendly geometry, spaciousness, and refined interactions of Airbnb.

However, the application must have its own distinctive identity. Do not copy Airbnb's logo, proprietary assets, typography, branded illustrations, or exact interface compositions.

**The user experience must feel effortless, sophisticated, fast, and visually memorable.**

This is not just a landing page or UI prototype. Build a functioning application with real data persistence, authentication, prompt management, search, organization, offline operation, and synchronization.

## Important development rules

1. Build the website first.
2. Do not build the Android APK or Chrome extension yet.
3. Structure the codebase so both can be added later.
4. Never replace requested functionality with static visual mockups.
5. All buttons, menus, dialogs, filters, forms, and controls must work.
6. Never create fake success messages for operations that have not actually succeeded.
7. Avoid unnecessary complexity while maintaining production-quality architecture.
8. Prefer free-tier-friendly services and open-source dependencies.
9. Prioritize visual quality, responsiveness, performance, accessibility, data safety, and maintainability.
10. Where an implementation requires external configuration, provide a complete setup guide rather than pretending it is connected.
11. Do not silently omit any requirement. Maintain a feature checklist and report anything incomplete.
12. Do not deploy or publish the application without the user's authorization.

---

# 2. PRODUCT VISION

Create a private personal library for storing, organizing, finding, editing, reusing, and managing AI prompts.

The application is inspired by an earlier product named Vault Pro.

Preserve its core concepts:

- Prompt creation, editing, and deletion
- Categories and organization
- Prompt variables
- Searching and sorting
- Google authentication
- Cloud synchronization
- Offline accessibility
- Import and export
- Account management
- Multi-device continuity

Expand this foundation with modern usability features and a completely redesigned interface.

### Core product philosophy

**Save once. Find anywhere. Copy instantly.**

The application must minimize the number of interactions required to find and use a prompt.

A typical workflow should be:

1. Open the website.
2. Search for a prompt or browse a collection.
3. Find the desired prompt.
4. Click Copy.
5. The original prompt is immediately copied.

No unnecessary confirmation dialogs or intermediate screens.

---

# 3. PLATFORM STRATEGY

The eventual product will support three platforms:

- Web application
- Android APK
- Chrome browser extension

This development phase covers **the web application only**.

Design the application architecture so its data model, authentication approach, validation rules, prompt logic, variable processing, and synchronization contracts can be reused by future clients.

Recommended architecture:

- Shared domain and utility modules
- Reusable data access layer
- Platform-independent prompt models
- Abstracted clipboard operations
- Reusable synchronization contracts
- Web-specific responsive interface
- Future-compatible extension architecture

Do not introduce platform-specific assumptions into the core data model.

---

# 4. TECHNOLOGY STACK

Use a modern, maintainable stack.

Preferred choices:

**Frontend**
- React
- TypeScript
- Vite
- Tailwind CSS

**UI**
- Accessible component primitives such as Radix UI
- Lucide icons
- Custom reusable design components

**Animations**
- CSS transitions for simple interactions
- Motion for more complex transitions when necessary

**Backend**
- Firebase Authentication
- Cloud Firestore

**Offline storage**
- IndexedDB
- A suitable IndexedDB abstraction such as Dexie

**Hosting**
- Cloudflare Pages or another suitable free-tier-friendly static hosting provider

**Testing**
- Vitest or equivalent
- React Testing Library
- Playwright for end-to-end workflows

Use compatible, actively maintained versions of dependencies.

Verify current documentation and compatibility before installation.

Do not add libraries just for visual decoration.

### Architecture requirements

Separate the codebase into logical modules:

- Authentication
- Prompts
- Categories
- Tags
- Collections
- Templates
- Variables
- Search
- Favorites
- Version history
- Activity history
- Synchronization
- Offline database
- Backup/export
- Settings
- Shared UI components

Use a clean, predictable folder structure.

---

# 5. VISUAL DESIGN DIRECTION

## Primary inspiration: Airbnb

Use Airbnb as an inspiration for:

- Approachable visual simplicity
- Rounded geometry
- Spacious layouts
- High-quality card design
- Strong content hierarchy
- Minimal visual clutter
- Refined navigation
- Thoughtful hover behavior
- Beautiful interaction feedback
- Consumer-product-level polish

This must be an original product identity, not an Airbnb clone.

## Theme

**Dark mode by default.**

The entire application must be designed specifically for dark mode rather than simply converting a light interface into dark colors.

### Color system

Use the following initial design tokens:

| Token | Color |
|---|---|
| Main background | `#171717` |
| Primary surface | `#222222` |
| Elevated surface | `#292929` |
| Subtle surface | `#303030` |
| Primary text | `#FFFFFF` |
| Secondary text | `#A3A3A3` |
| Muted text | `#777777` |
| Border | `#393939` |
| Primary accent | `#FF385C` |
| Accent hover | `#E92E51` |
| Accent soft background | `rgba(255,56,92,0.12)` |

Additional semantic colors may be introduced for success, warnings, errors, and synchronization status.

The coral accent should be used strategically.

Do not overuse coral.

The interface should remain predominantly neutral, with accent color directing attention toward primary actions and active states.

Ensure sufficient text and control contrast, including for small coral labels.

## Typography

Use an elegant, highly readable, rounded sans-serif with the friendly character of Airbnb's interface.

Preferred choices:

- Nunito Sans
- Inter
- Another suitable openly licensed typeface

Use a consistent typography scale.

Headings should feel confident and polished.

Body text should be readable, with balanced line height and comfortable spacing.

Avoid excessive font weights and oversized headings.

## Geometry

- Generously rounded cards
- Pill-shaped filters and primary controls where appropriate
- Soft corners on modals
- Clean input fields
- Consistent spacing
- Subtle dividers
- Delicate shadows on elevated surfaces

Suggested starting radii:

- Small controls: 10–12px
- Inputs: 12–16px
- Cards: 18–24px
- Large panels: 22–28px
- Pills: fully rounded

These are starting guidelines, not rigid constraints. Adjust them to achieve visual consistency.

## Visual quality expectations

The final application should feel like a professionally designed, premium SaaS product.

Avoid:

- Generic admin-dashboard appearance
- Excessive gradients
- Neon glow everywhere
- Heavy glassmorphism
- Overcrowded sidebars
- Too many accent colors
- Unnecessary illustrations
- Cluttered cards
- Oversized controls
- Aggressive animations
- Visually inconsistent buttons
- Decorative elements that reduce usability

---

# 6. APPLICATION LAYOUT

## Desktop layout

Create a modern application shell consisting of:

1. Left navigation sidebar
2. Main content region
3. Contextual top toolbar
4. Optional right-side prompt detail panel

### Sidebar

Navigation items:

- Home
- All Prompts
- Favorites
- Recently Used
- Collections
- Categories
- Templates
- Recycle Bin
- Settings

The sidebar should be elegant and compact.

Include:

- Original product logo or temporary typographic mark
- Application name
- Collapsible navigation groups
- Active navigation indicator
- Relevant icons
- New Prompt action
- Profile/account control
- Sync status indicator

Allow sidebar collapse.

Collapsed mode should show icons with accessible tooltips.

Use tasteful hover backgrounds and active-state highlighting.

### Main content

Use a responsive maximum content width, sensible margins, and a layout that accommodates both smaller laptop displays and larger monitors.

Do not waste excessive space on large screens.

### Top toolbar

Include contextually appropriate controls:

- Page title
- Global search
- New Prompt
- Grid/list switch
- Sorting
- Filter controls
- Account menu where appropriate

Do not display every control on every page if it is irrelevant.

---

# 7. DASHBOARD / HOME SCREEN

The dashboard should feel inviting and immediately useful.

Suggested layout:

### Section A — Welcome header

Display a concise personalized greeting or workspace title.

Example:

"Your ideas, beautifully organized."

Include a prominent but restrained New Prompt button.

### Section B — Global search

A large, elegant search field.

Placeholder:

"Search your prompts..."

Search should be one of the most visually prominent elements.

Include a keyboard shortcut hint, such as Ctrl/Cmd + K.

### Section C — Quick access

Show:

- Favorites
- Recently Used
- Recently Edited
- Collections

### Section D — Recent prompts

Display recently accessed prompts in a visually balanced card grid.

### Section E — Collections

Show collection cards.

Each card can include:

- Collection title
- Short description
- Number of prompts
- Simple icon
- Optional user-selected color

Use restrained visual variety.

### Empty state

For a new account with no prompts, show a beautifully designed empty state with:

- Friendly explanation
- Clear New Prompt button
- Optional suggestion to create a collection

Never populate the user's real library with fake sample records without consent.

---

# 8. PROMPT LIBRARY

The main library is one of the most important screens.

## Two browsing layouts

Support:

**Grid View**
- Beautiful rounded cards
- Strong typographic hierarchy
- Prompt title
- Short content preview
- Primary category
- Relevant tags
- Favorite indicator
- Copy action
- Context menu

**Compact List View**
- Dense but readable rows
- Prompt title
- Category
- Date modified
- Tags or concise metadata
- Favorite
- Copy action
- Context menu

Include an obvious grid/list toggle.

Remember the user's selected view.

The two layouts must operate on the same underlying filtered and sorted dataset.

## Prompt cards

Design attractive cards with sophisticated hover effects.

When hovering:

- Card surface subtly changes
- Border becomes slightly more prominent
- Card may rise approximately 2–3px
- Shadow gently increases
- Relevant quick actions become more prominent

Do not use exaggerated scaling.

Do not cause neighboring cards to shift.

The card title and preview must remain readable.

Clicking the card opens its detail panel.

Clicking Copy must not open the detail panel.

Clicking Favorite must not open the detail panel.

Support keyboard interaction and visible focus indicators.

---

# 9. PROMPT DETAIL EXPERIENCE

## Desktop

Clicking a prompt opens a right-side panel.

The rest of the library stays visible.

The panel should have an elegant slide-in transition and maintain useful reading width.

Include:

- Prompt title
- Category
- Tags
- Collections
- Prompt type
- Full prompt content
- Copy Original button
- Fill Variables button, when applicable
- Favorite control
- Edit action
- Version History
- Duplicate
- Delete
- Created/modified metadata
- Optional reference links

### Panel behavior

- Open without losing scroll position
- Close using the close button
- Close using Escape when appropriate
- Handle browser back navigation predictably
- Support deep links to individual prompts
- Preserve library filters when the panel closes

### Narrow screens

Use a full-screen prompt detail experience instead of squeezing a sidebar into a narrow viewport.

---

# 10. PROMPT CREATION AND EDITING

The editor must feel polished, focused, and reliable.

## Required fields

**Title**
- Required
- Clearly labeled

**Prompt Content**
- Required
- Multiline editor
- Supports large prompts
- Preserves formatting and line breaks

**Primary Category**
- Select existing or create new

**Tags**
- Multiple tags
- Searchable selector
- Create new tag

**Collections**
- A prompt can belong to multiple collections

**Prompt Type**
- Text
- Image
- Video
- Code
- Other

**Reference Links**
- Optional
- Multiple URLs
- Validate URLs

**Favorite**
- Boolean toggle

**Variables**
- Automatically detect recognized placeholders

### Editor UX

- Clear Save action
- Cancel action
- Unsaved-change handling
- Local draft preservation
- Field validation
- Helpful error messages
- Character count where useful
- Autosave recovery for interrupted editing

Do not silently discard unsaved changes.

### Editing behavior

Editing an existing prompt must preserve its identity, relationships, and version history.

The application must not create duplicate records when a saved prompt is edited.

---

# 11. PROMPT VARIABLES

Support reusable placeholders using this syntax:

`{{variable_name}}`

Example:

"Create a cinematic commercial for {{product}} with {{lighting}} and {{camera_movement}}."

## Two distinct actions

### Copy Original

Immediately copy the exact original prompt text.

No dialog.

No variable form.

No unnecessary confirmation.

Show small nonintrusive success feedback.

### Fill Variables

Open a dedicated variable-filling interface.

The interface should:

1. Detect all unique variables.
2. Display editable inputs.
3. Allow users to enter replacement values.
4. Generate a live preview.
5. Offer Copy Filled Prompt.
6. Preserve the original prompt unchanged.
7. Handle repeated variable names consistently.

Missing variable values must not be silently removed.

Use clearly defined behavior, such as preserving unresolved placeholders and warning the user before copying an incomplete filled prompt.

Do not interpret prompt contents as executable code.

---

# 12. CATEGORIES, TAGS, AND COLLECTIONS

These are three different concepts.

## Categories

A broad classification.

Examples:

- Video Generation
- Image Generation
- Writing
- Coding
- Research

Each prompt has one primary category.

Users can:

- Create categories
- Rename categories
- Change category appearance
- Delete categories
- Reassign affected prompts

## Tags

Flexible labels.

Examples:

- Cinematic
- Product
- Realistic
- Animation
- Healthcare
- SaaS

A prompt can have multiple tags.

Support tag creation, editing, deletion, and filtering.

## Collections

Collections are curated groups of prompts.

They are an important feature and should be visually prominent.

Example:

**SaaS Explainer Production**

May include:

- Scriptwriting prompt
- Storyboard generation prompt
- Video generation prompt
- Voiceover refinement prompt
- Animation concept prompt

These prompts can belong to different categories.

A prompt may belong to more than one collection.

Collections must reference existing prompts rather than duplicate their content.

### Collection functionality

- Create collection
- Rename
- Edit description
- Choose icon
- Optional accent color
- Add prompts
- Remove prompts
- Reorder prompts
- Delete collection

Deleting a collection must not delete the prompts inside it.

### Collection interface

Design beautiful Airbnb-inspired collection cards, adapted to the product's original visual identity.

Use typography, icons, color accents, and restrained styling rather than mandatory thumbnail images.

---

# 13. SEARCH, FILTERS, AND SORTING

Implement a powerful but simple search experience.

Search across:

- Prompt titles
- Prompt content
- Categories
- Tags
- Collection names where contextually relevant
- Prompt types

### Search requirements

- Fast results
- Case-insensitive matching
- Support partial words
- Clear search button
- Keyboard accessibility
- Highlight matches where useful
- Good empty-result states

### Filters

Support filtering by:

- Category
- Tags
- Collection
- Prompt type
- Favorites

Allow sensible combinations.

### Sorting

- Recently modified
- Recently created
- Alphabetical A–Z
- Alphabetical Z–A
- Recently used
- Most frequently copied

Make active filters obvious.

Provide Clear All Filters.

Store user preferences where appropriate.

For large libraries, design efficient indexing, rendering, and querying rather than loading every record unnecessarily.

---

# 14. FAVORITES AND RECENT ACTIVITY

## Favorites

Allow users to favorite and unfavorite prompts instantly.

Favorite state must synchronize between devices.

Provide a dedicated Favorites page.

## Recently Used

When a prompt is copied, record the usage event and update relevant activity metadata.

Show recently used prompts on the dashboard.

Do not duplicate prompt records to create usage history.

## Usage statistics

Support lightweight metadata:

- Last copied date
- Copy count
- Last modified date

Avoid unnecessary analytics or external behavior tracking.

Usage records must remain private.

---

# 15. PROMPT TEMPLATES

Templates allow users to start from reusable prompt structures.

Support:

- Creating a template
- Editing templates
- Deleting templates
- Applying a template to create a new prompt
- Including placeholder variables
- Organizing templates

Templates must not be confused with ordinary prompts.

A template should function as a reusable starting point.

Applying a template must not overwrite the original template.

Provide a clean Templates page with the same visual system as the main library.

---

# 16. VERSION HISTORY

Automatically preserve earlier versions of prompt content after meaningful saved edits.

Version history must support:

- Viewing previous revisions
- Comparing versions
- Viewing timestamps
- Restoring a previous revision
- Preserving the current version before restoration

Implement configurable or bounded retention to avoid unlimited storage growth.

For the initial implementation, use a documented reasonable retention limit, such as the latest 20 meaningful revisions per prompt, unless the architecture supports a better sustainable policy.

Avoid generating a new version for every keystroke.

Version history must work safely with offline editing.

---

# 17. RECYCLE BIN

Deleting a prompt should normally perform a soft delete.

Include:

- Recycle Bin page
- Restore action
- Permanent Delete action
- Empty Bin action
- Confirmation for irreversible deletion

Suggested retention: 30 days.

The retention policy must be implemented and documented rather than merely displayed.

Deleting a prompt should not leave broken collection references.

Offline deletions must synchronize safely without silently resurrecting deleted records.

---

# 18. GOOGLE AUTHENTICATION

Use Google sign-in through Firebase Authentication.

This is a private, single-user application.

**Do not assume that Google sign-in alone makes the database private.**

Implement secure authorization.

The application's real data access must be restricted to a specific approved Firebase user UID.

Allow initial owner enrollment only through an explicitly controlled configuration or trusted setup mechanism.

Do not allow arbitrary Google accounts to register as new owners.

A non-authorized Google account must not gain access to the library.

### Authentication UX

- Polished sign-in screen
- Sign in with Google
- Clear authentication errors
- Session persistence
- Sign out
- Protected routes
- Appropriate loading states

Do not expose privileged server credentials or service-account keys in frontend code.

Use restrictive Firestore security rules and test them.

---

# 19. CLOUD DATABASE AND SYNCHRONIZATION

Use Cloud Firestore as the primary cloud database unless a better-supported architecture is justified.

Design a coherent data model for:

- Users
- Prompts
- Categories
- Tags
- Collections
- Collection membership/order
- Templates
- Prompt versions
- Usage metadata
- User settings
- Deleted records/tombstones
- Synchronization metadata

### Data requirements

Each relevant record should have:

- Stable unique identifier
- Owner identifier
- Created timestamp
- Modified timestamp
- Revision/version metadata where applicable

Use consistent timestamps and deterministic serialization.

Ensure all queries and writes are properly authorized.

### Real-time sync

When an online change is committed, other active clients should receive it without requiring manual refresh.

### Offline behavior

The web app must support:

- Reading previously cached data
- Creating prompts offline
- Editing prompts offline
- Deleting prompts offline
- Organizing cached prompts offline
- Copying prompts offline
- Synchronizing pending changes after reconnection

Use IndexedDB where appropriate.

### Sync status

Provide subtle but understandable status indicators:

- Synced
- Saving locally
- Syncing
- Offline
- Sync error
- Conflict requires attention

Never show "Synced" for a change that only exists locally.

### Conflict protection

Do not use silent last-write-wins behavior that can destroy offline edits.

If the same prompt is independently edited on two devices, preserve conflicting versions and provide a safe resolution workflow.

For example:

- Keep local revision
- Keep cloud revision
- Save both as separate revisions or prompt copies

Do not discard data automatically.

Use stable mutation identifiers or equivalent techniques to avoid duplicate operations during retries.

### Offline limitations

Explain that an offline device can only access records previously cached or created on that device.

Test cold-start offline behavior and returning-online behavior.

---

# 20. BACKUP AND DATA RECOVERY

The user requires:

**Automatic cloud backup + manual export.**

Synchronization alone is not a backup.

## Automatic backups

Design a real backup mechanism that stores recoverable snapshots independently of the live records.

Backups should include:

- Prompts
- Categories
- Tags
- Collections and membership
- Templates
- Version history as applicable
- Relevant settings and metadata

Specify:

- Backup frequency
- Backup retention
- Storage location
- Recovery procedure
- Access restrictions
- Failure monitoring
- Estimated free-tier usage

A daily backup with a defined retention window is a suitable initial goal.

However, do not claim scheduled backups work automatically unless the required infrastructure, permissions, and configuration are actually deployed.

If a reliable scheduled backup cannot be enabled within the available free-tier setup, clearly document the limitation and present the safest feasible implementation path.

## Manual export

Allow the user to export their library as JSON.

The export should contain:

- Schema version
- Export timestamp
- Prompts
- Organization metadata
- Collections
- Templates
- Relevant version information

Avoid including secrets or authentication tokens.

## Manual import

Provide a compatible JSON import mechanism.

Support validation and duplicate handling.

Include a preview of what will be imported.

Prevent accidental overwriting.

A restore operation must be explicitly confirmed.

Test export/import round trips.

---

# 21. CHROME EXTENSION READINESS

Do not build the extension in this phase.

However, plan for it to support:

- Quick prompt search
- Instant copy
- Recent prompts
- Favorites
- Save selected text from a webpage
- Quick-save prompt form

Keep the shared data model compatible with a future Chrome Manifest V3 extension.

Avoid architectural decisions that require the extension to embed privileged credentials.

Authentication and browser permissions will require a separate implementation and security review.

---

# 22. ANDROID APK READINESS

Do not build the APK in this phase.

The website and future Android app must share the primary application logic.

Use responsive design and platform abstraction so the web app can later be packaged into an Android APK using a suitable wrapper such as Capacitor.

Plan for:

- Mobile touch interactions
- Android back navigation
- Clipboard access
- Local storage
- Offline operation
- Safe-area insets
- Keyboard handling
- Native-feeling navigation
- Authentication redirect compatibility

Do not assume every browser API behaves identically inside an Android WebView.

---

# 23. RESPONSIVE DESIGN

The web application must work beautifully on:

- Large desktop monitors
- Standard laptops
- Tablets
- Mobile browsers

## Desktop

- Sidebar navigation
- Spacious content area
- Multi-column prompt cards
- Right-side prompt detail panel

## Tablet

- Compact sidebar or adaptive navigation
- Reduced grid columns
- Comfortable touch targets

## Mobile

- Compact header
- Bottom navigation or similarly intuitive mobile navigation
- Single-column cards when appropriate
- Full-screen prompt detail
- Easy thumb-accessible primary actions
- No horizontal overflow

Ensure search, filters, forms, variable inputs, and dialogs remain usable when the on-screen keyboard is open.

---

# 24. PREMIUM HOVER EFFECTS AND MICRO-INTERACTIONS

Interaction design is a major visual priority.

Every animation must feel intentional and refined.

## Card hover

Use subtle:

- Elevation changes
- Border changes
- Shadow transitions
- Surface brightening
- Quick-action emphasis

## Button interactions

Use:

- Smooth background changes
- Slight pressed-state feedback
- Elegant focus rings
- Subtle icon movement where helpful

## Navigation

- Smooth sidebar collapse
- Refined active-item indicator
- Responsive hover highlights
- Clear expanded/collapsed states

## Prompt detail panel

- Smooth slide-in
- Gentle opacity transition
- Predictable close animation

## Dialogs

- Short fade and scale transitions
- Appropriate focus management
- Clear close behavior

## Copy feedback

When Copy succeeds:

- Show a concise "Copied" confirmation
- Optionally animate the copy icon into a checkmark
- Restore the normal icon after a short interval

## Suggested timing

- Micro-interactions: approximately 120–180ms
- Card transitions: approximately 160–240ms
- Panels: approximately 220–320ms
- Dialogs: approximately 180–250ms

Use tasteful easing curves.

Avoid spring effects that produce excessive bouncing.

Respect `prefers-reduced-motion`.

Do not animate properties that unnecessarily damage scrolling or rendering performance.

---

# 25. KEYBOARD SHORTCUTS

Support useful desktop shortcuts.

Suggested mappings:

- Ctrl/Cmd + K — Global search
- Ctrl/Cmd + N — New prompt
- Escape — Close active dialog or panel
- Ctrl/Cmd + Enter — Save editor where appropriate

Avoid overriding browser shortcuts in confusing ways.

Provide a shortcut help section if more shortcuts are added.

Keyboard shortcuts must not interrupt normal typing in input fields.

---

# 26. SETTINGS

Create a refined Settings page.

Sections:

## Account
- Google account information
- Sign out
- Owner account status

## Appearance
- Dark theme as default
- Future theme expansion compatibility
- Reduced motion preference where appropriate

## Library
- Default grid/list view
- Default sorting
- Relevant organizational preferences

## Data
- Export library
- Import library
- Backup status
- Restore guidance
- Storage usage where available

## Sync
- Connection status
- Pending changes
- Last successful synchronization
- Conflict review

## About
- App name
- Application version
- Relevant support or documentation information

---

# 27. ACCESSIBILITY

Follow modern accessibility best practices.

Requirements:

- Keyboard-accessible controls
- Visible focus states
- Semantic structure
- Correct button labels
- Accessible dialogs
- Appropriate screen reader descriptions
- Sufficient color contrast
- Touch-friendly controls
- Reduced motion support
- Clear validation messages

Aim for WCAG 2.2 AA where applicable.

Do not rely on color alone to communicate status.

---

# 28. PERFORMANCE

The application should feel fast even with a large prompt library.

Prioritize:

- Fast initial rendering
- Efficient Firestore queries
- IndexedDB caching
- Debounced searching where useful
- Efficient list rendering
- Memoization only where beneficial
- Lazy loading large modules
- Sensible code splitting
- Minimal animation overhead

Avoid unnecessarily fetching full version histories for every prompt card.

Avoid loading every document if the library becomes large.

Design for thousands of prompts without obvious interface degradation.

---

# 29. ERROR HANDLING

Implement meaningful error and recovery states.

Cover:

- Authentication failure
- Offline access
- Cloud synchronization failure
- Firestore permission errors
- Import validation failure
- Backup failure
- Save failure
- Clipboard permission failure
- Conflict detection
- Invalid URLs
- Missing records
- Unexpected application errors

Never silently swallow errors.

Error messages should be clear and understandable rather than displaying raw stack traces.

Preserve local edits when cloud operations fail.

---

# 30. EMPTY STATES AND FEEDBACK

Design thoughtful empty states for:

- New library
- Empty category
- Empty collection
- No favorites
- No search results
- Recycle Bin
- No recent activity

Use original icons, typography, and optional minimal illustrations.

Show clear actions where helpful.

Provide consistent toast feedback for:

- Prompt saved
- Prompt copied
- Favorite added
- Prompt restored
- Import completed
- Sync failure
- Backup status

Feedback should reflect actual operation results.

---

# 31. SECURITY REQUIREMENTS

This application stores potentially private user-authored prompts.

Treat all prompt contents as untrusted input.

Requirements:

- Secure authentication
- Owner-restricted database rules
- Input validation
- Safe text rendering
- No unsafe HTML injection
- No arbitrary code execution from prompts
- No exposed service-account secrets
- Minimal permissions
- Secure deployment configuration
- Appropriate browser security policies
- Protected backup storage

When rendering prompts containing HTML or code, display them as text or appropriately escaped code.

Do not execute them.

Do not implement public sharing, team access, or unrestricted collaboration.

This is a private single-user product.

---

# 32. DESIGN CONSISTENCY

Create a reusable design system.

Components should include:

- Buttons
- Icon buttons
- Inputs
- Textareas
- Selectors
- Tag chips
- Category badges
- Cards
- Dialogs
- Side panels
- Dropdown menus
- Tooltips
- Toasts
- Empty states
- Loading states
- Search controls
- Navigation items
- Status indicators

Keep spacing, radius, shadows, border colors, typography, and transitions consistent.

Do not build every screen using unrelated one-off styles.

---

# 33. TESTING REQUIREMENTS

Write meaningful tests for critical functionality.

At minimum, verify:

1. Authorized Google authentication.
2. Unauthorized account rejection.
3. Create prompt.
4. Edit prompt.
5. Delete and restore prompt.
6. Duplicate prompt.
7. Instant raw copy.
8. Variable detection and replacement.
9. Category management.
10. Tag management.
11. Collection management.
12. Grid/list switching.
13. Searching, filtering, and sorting.
14. Favorites.
15. Version restoration.
16. Offline creation and synchronization.
17. Offline deletion and reconnection.
18. Conflicting offline edits.
19. Export/import round trip.
20. Navigation and responsive behavior.
21. Failed network requests.
22. Keyboard navigation and accessible controls.

Do not claim tests passed unless they were actually executed.

---

# 34. DESIGN QUALITY REVIEW

Before finalizing, review the application visually.

Inspect:

- Desktop dashboard
- Desktop library grid
- Desktop list view
- Prompt detail panel
- Prompt editor
- Collection page
- Favorites
- Settings
- Tablet viewport
- Mobile viewport
- Empty states
- Dialogs
- Hover states
- Focus states

Look for:

- Inconsistent spacing
- Unbalanced negative space
- Poor typography
- Excessive visual density
- Low contrast
- Misaligned buttons
- Broken responsive layouts
- Unusable dialogs
- Awkward animations
- Content overflow

Iterate until the interface feels coherent and professionally designed.

Use real browser-based visual verification when the development environment supports it.

---

# 35. IMPLEMENTATION ORDER

Follow a structured implementation sequence.

### Phase A — Foundation
- Project setup
- Architecture
- Design tokens
- Reusable components
- Routing
- Layout shell

### Phase B — Core Experience
- Dashboard
- Library
- Grid/list views
- Prompt detail panel
- Prompt editor
- Categories
- Tags
- Collections

### Phase C — Productivity Features
- Favorites
- Copy actions
- Variables
- Templates
- Search and filters
- Recent activity
- Version history
- Recycle Bin

### Phase D — Data Infrastructure
- Firebase authentication
- Firestore integration
- Owner authorization
- Offline persistence
- Synchronization
- Conflict handling
- Backup/export/import

### Phase E — Refinement
- Hover effects
- Animations
- Responsive polish
- Accessibility
- Error handling
- Performance improvements

### Phase F — Verification
- Automated testing
- Visual testing
- Security rule checks
- Offline synchronization testing
- Build verification
- Deployment documentation

Build components incrementally, but keep the architecture consistent from the beginning.

---

# 36. REQUIRED DELIVERABLES

Provide:

1. Complete web application source code.
2. Working development environment.
3. Functional UI components.
4. Firebase integration and security rules.
5. IndexedDB/offline synchronization implementation.
6. Import/export implementation.
7. Backup implementation or clearly documented infrastructure-dependent setup.
8. Responsive layouts.
9. Tests and test results.
10. Environment variable template.
11. Installation and setup instructions.
12. Firebase setup instructions.
13. Deployment instructions.
14. Feature completion checklist.
15. Known limitations and unresolved configuration requirements.

Do not hardcode secret credentials.

Do not fabricate backend connections, backups, successful tests, or deployed resources.

---

# 37. ACCEPTANCE CRITERIA

The website is ready for acceptance only when the following conditions are satisfied:

- The application has a cohesive, beautiful, premium dark UI.
- The coral-accent design feels intentional and not overused.
- The interface is clearly Airbnb-inspired in usability but visually original.
- All visible controls function.
- Prompts can be created, edited, copied, duplicated, and deleted.
- Categories, tags, and collections work.
- Grid and list views both work.
- The dashboard shows relevant real data.
- Prompt details open in a side panel on desktop.
- Raw copy is immediate.
- Variable filling is a separate workflow.
- Search and filters are functional.
- Google authentication works for the authorized owner.
- Unauthorized accounts cannot access the data.
- Data persists across sessions.
- Offline CRUD operations work on cached data.
- Changes synchronize safely after reconnection.
- Conflicting edits are not silently lost.
- Version history works.
- Recycle Bin restoration works.
- Manual export/import works.
- Automatic backups are genuinely implemented and configured, or any outstanding configuration is explicitly reported.
- Responsive layouts are usable.
- Keyboard interaction is supported.
- No significant console errors occur during normal use.
- Critical automated tests pass.
- A production build completes successfully.
- The architecture remains compatible with future Android and Chrome extension development.

---

# 38. FINAL INSTRUCTION

Treat this as a premium personal software product, not a quick UI experiment.

Pay particular attention to:

**Visual design.**
The website must be exceptionally clean, beautiful, polished, and distinctive.

**Interaction quality.**
Hover effects, card animations, transitions, panel behavior, and feedback should feel sophisticated and deliberate.

**Speed.**
Finding and copying prompts must be effortless.

**Functionality.**
Every feature must work with real state and real persistence.

**Data safety.**
Never sacrifice user data to simplify synchronization.

**Future expansion.**
The website is Phase 1 of a cross-platform system. Preserve a reusable foundation for the Android APK and Chrome extension.

Prioritize thoughtful design and maintainable engineering over unnecessary feature complexity.

Begin by establishing the project architecture and design system, then implement the complete website in the specified phases.

Do not silently remove features or replace them with placeholders.

**The final result should feel like an original, premium application that someone would genuinely enjoy using every day.**