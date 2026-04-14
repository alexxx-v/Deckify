# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.5.0](https://github.com/alexxx-v/Deckify/compare/v1.4.4...v1.5.0) (2026-04-14)


### Features

* add duration column to board task list view and increase container width ([ffa488c](https://github.com/alexxx-v/Deckify/commit/ffa488cb260d0bb52ce64739d01f5de5b0b5d41a))
* add task duration column and table headers to PDF renderer and project presentation views ([ee4ad49](https://github.com/alexxx-v/Deckify/commit/ee4ad492bee8aaa7bba260af112df72d88b4774c))
* introduce global task types and refactor management logic into a reusable component ([8d2aa04](https://github.com/alexxx-v/Deckify/commit/8d2aa04a23165d8c91cc9e4ada8729d778bcc7a9))

### [1.4.4](https://github.com/alexxx-v/Deckify/compare/v1.4.3...v1.4.4) (2026-04-09)


### Bug Fixes

* improve TaskEditView state synchronization and add drag activation threshold ([c8c2dc2](https://github.com/alexxx-v/Deckify/commit/c8c2dc23bfd8f3522974ff86b35491fbb1b097a6))
* improve TaskEditView state synchronization and drag-and-drop reliability ([5053364](https://github.com/alexxx-v/Deckify/commit/505336434343c35dbaf70fe002a36a7f09504e55))

### [1.4.3](https://github.com/alexxx-v/Deckify/compare/v1.4.2...v1.4.3) (2026-04-09)

### [1.4.2](https://github.com/alexxx-v/Deckify/compare/v1.4.1...v1.4.2) (2026-04-08)

### [1.4.1](https://github.com/alexxx-v/Deckify/compare/v1.4.0...v1.4.1) (2026-04-08)

## [1.4.0](https://github.com/alexxx-v/Deckify/compare/v1.3.2...v1.4.0) (2026-04-08)


### Features

* add unsaved changes protection with browser warning and confirmation dialog in TaskEditView ([be08c1c](https://github.com/alexxx-v/Deckify/commit/be08c1ce42c31d7bd516b5c4d32a6e7d36dc20f7))

### [1.3.2](https://github.com/alexxx-v/Deckify/compare/v1.3.1...v1.3.2) (2026-04-07)

### [1.3.1](https://github.com/alexxx-v/Deckify/compare/v1.3.0...v1.3.1) (2026-04-07)

## [1.3.0](https://github.com/alexxx-v/Deckify/compare/v1.2.0...v1.3.0) (2026-04-07)


### Features

* add manual update check button and fix build config ([9c2ccaa](https://github.com/alexxx-v/Deckify/commit/9c2ccaaa1ba5bd63585f80c486dd8a7d120d100b))

## [1.2.0](https://github.com/alexxx-v/Deckify/compare/v1.1.0...v1.2.0) (2026-04-07)


### Features

* add planned start date and duration to tasks with visual representation in timeline ([12dfa39](https://github.com/alexxx-v/Deckify/commit/12dfa3981bd87a4fbd75218f905f5880c1d0980c))
* add task delay calculation and visualization to PDF report with updated localization strings ([ead3837](https://github.com/alexxx-v/Deckify/commit/ead38379c563754d05e8a04dc7fb94d0f86ac159))
* add visual indicator for current date in ProjectTasks timeline view ([cd2ff5a](https://github.com/alexxx-v/Deckify/commit/cd2ff5a5f537edcc3684e83a465de9bb51552f5c))
* update roadmap bar styling with striped patterns in PDF renderer and web UI ([44a568c](https://github.com/alexxx-v/Deckify/commit/44a568c330e4ec2f626f5fdf4fe47a53b941547e))

## 1.1.0 (2026-04-02)


### Features

* Add 'current' period selection for roadmap generation and enhance timeline label formatting for improved readability. ([02a5f46](https://github.com/alexxx-v/Deckify/commit/02a5f463528f64d44e63489ca7c447fa7f36b971))
* Add a donut chart visualization to the task type summary in the PDF renderer. ([1106929](https://github.com/alexxx-v/Deckify/commit/1106929cc8e6c0f93c9d5010b28bf44a6352c39a))
* add Board entity for cross-project task aggregation ([c6d7100](https://github.com/alexxx-v/Deckify/commit/c6d7100f25a0b19817e1dc1bd83f8cb5c093adc3))
* Add date range filtering and selection UI for TASK_DETAIL blocks in PDF templates, including new localization strings. ([4936dd5](https://github.com/alexxx-v/Deckify/commit/4936dd518f6f4521f3802c1a1855d2625356e369))
* Add date range selection for roadmap and display period label in PDF. ([539b10f](https://github.com/alexxx-v/Deckify/commit/539b10fb026a2174b366b2654384fedfbf5d273b))
* add dateRange property to ROADMAP block (month/quarter/year) ([00a4d03](https://github.com/alexxx-v/Deckify/commit/00a4d0329fc0ccc49c4bdf64bda111edd3599e21))
* Add flexible duration unit selection for tasks and enhanced period selection for PDF export. ([6f78e90](https://github.com/alexxx-v/Deckify/commit/6f78e90bc64af00283a4052d542b86fe23618f9c))
* add project grouping and optimize task processing with useMemo in BoardTasks ([51c9b80](https://github.com/alexxx-v/Deckify/commit/51c9b808ce04ffc1ce149ac6ce5d0b954d3f42cb))
* add save animation and toast notification for template editor ([5747b17](https://github.com/alexxx-v/Deckify/commit/5747b17f066d51d4f01b011036dba1e101cbfffa))
* add TEXT block to PDF templates builder ([1828103](https://github.com/alexxx-v/Deckify/commit/18281037dbf7e956c45e66d6ce39943b37f37623))
* add timeframe and date filtering to board tasks with persistent state support ([5de2eaa](https://github.com/alexxx-v/Deckify/commit/5de2eaa0f4d65ad335e573e2434f98ed71b15e02))
* add visual mini-previews to template block cards ([7221485](https://github.com/alexxx-v/Deckify/commit/72214857820aa37e9de6ae2758444207866036cc))
* Automatically set task progress to 100% and disable the slider when status is 'done', and update the README with new overview and download links. ([7aabffb](https://github.com/alexxx-v/Deckify/commit/7aabffb24c92f3c50015a1022ff11436170ce2b9))
* Dynamically adjust PDF description font size, refine PDF layout elements, and increase the Markdown editor height. ([a689a5a](https://github.com/alexxx-v/Deckify/commit/a689a5ad5e577df24ba8bd2eaedaa3ee997f3f28))
* Enhance PDF generation with centralized font registration, improved robustness, and updated error handling, while also updating the README to reflect SQLite storage. ([28a4690](https://github.com/alexxx-v/Deckify/commit/28a46900ce72e3d38a029a200e1042cb80f80448))
* enhance task list UI with improved sticky headers, dark mode support, and refined PDF roadmap styling ([597777b](https://github.com/alexxx-v/Deckify/commit/597777b9b670740b48b4f2a9e4f9a8fea1bb7414))
* Implement dashboard and settings pages, and add task status display to project and PDF views. ([b97cedd](https://github.com/alexxx-v/Deckify/commit/b97cedd0c0ebd09a0ff18c72e3073dbfe5da4c16))
* Implement drag-and-drop for tasks on the roadmap and task steps, and enhance empty states and modal animations. ([84532b5](https://github.com/alexxx-v/Deckify/commit/84532b53d9575ae80c067ef5a7d6a7f9b5da14d0))
* implement flexible template builder and dynamic pdf rendering ([c97881e](https://github.com/alexxx-v/Deckify/commit/c97881eb8387a55abae9bbc1ed959535e2351983))
* Implement internationalization and enhance UI/UX with a redesigned database setup and dynamic sidebar. ([25eda43](https://github.com/alexxx-v/Deckify/commit/25eda43ea5cbbb8581556980892ea12260eff8c6))
* Implement Markdown rendering for PDF content and extend PDF statistics, alongside removing the task list table view. ([3c66c27](https://github.com/alexxx-v/Deckify/commit/3c66c2746704c2e540243ca608c89421b5e9ae4d))
* implement nested project and task type grouping for board PDF exports and roadmap visualizations ([7ae3b4e](https://github.com/alexxx-v/Deckify/commit/7ae3b4e7574a0369f4ba61cc5508120165ecf671))
* implement nested task grouping by project and task type in BoardTasks view ([73a8329](https://github.com/alexxx-v/Deckify/commit/73a8329b28ed7be0e4e4f3bf7cb916f4dcf95194))
* Implement table-like task list view with end date column and update task bar text styling. ([5300d2a](https://github.com/alexxx-v/Deckify/commit/5300d2a2aa6709f28484dc3c707577737bd1bb15))
* Implement task deletion and enhance project deletion with i18n confirmations and `dayjs` locale integration. ([60a2b2a](https://github.com/alexxx-v/Deckify/commit/60a2b2a40ac71e18b927cecc100d347a69b8531f))
* Implement task duplication functionality including a dedicated button, i18n support, and success notifications. ([a73f416](https://github.com/alexxx-v/Deckify/commit/a73f416280bd7b2281aed83c4360f9dd2a96998a))
* Implement task filtering by timeframe (all, month, quarter, year) with dynamic roadmap visualization. ([a2cd225](https://github.com/alexxx-v/Deckify/commit/a2cd225fda55e7364066e0766d0fd3f0a13cc59c))
* Implement task sorting by start date, status, and duration with UI controls and persistence, and enhance PDF rendering of task steps to show all steps with detailed status styling. ([ee059b1](https://github.com/alexxx-v/Deckify/commit/ee059b130939d19d9dfdea83b0a1cbd2ac00038c))
* implement text wrapping and refactor roadmap for multi-line support ([f4a1729](https://github.com/alexxx-v/Deckify/commit/f4a172916088d04bcea6629b72a11ad149c4c583))
* Integrate rich text editor for PDF template text blocks, update documentation, and refine PDF export UI. ([1019786](https://github.com/alexxx-v/Deckify/commit/10197866f2b957bb71e17385a9e9a267d31e3d45))
* Introduce `allProjectTasks` prop to `DynamicPdfRenderer` and filter roadmap tasks by their overlap with the roadmap's date range. ([2191040](https://github.com/alexxx-v/Deckify/commit/2191040ffcbc0b6396cd0b3a2e4957a5e014accf))
* introduce task types with project settings management and a new PDF type summary block ([507d0c4](https://github.com/alexxx-v/Deckify/commit/507d0c44e68cb8bc7246fdbf08b1e4a80ede8ce1))
* Make modals vertically scrollable with fixed headers and footers to prevent content overflow. ([28b3e3c](https://github.com/alexxx-v/Deckify/commit/28b3e3ceb192f07604a4f976299d36bf33157830))
* Make task sidebar width responsive with a minimum width. ([ac3b4ce](https://github.com/alexxx-v/Deckify/commit/ac3b4ceb5f4ad93b354ae4ce9bdebbf99afddb13))
* Migrate database from Dexie to better-sqlite3, updating schema and component data access. ([36e4ed8](https://github.com/alexxx-v/Deckify/commit/36e4ed82f37922e7aab658dd28c70f638205e120))
* persist project task view mode and timeframe to local storage, and refactor task list items for improved interaction and roadmap rendering. ([d604202](https://github.com/alexxx-v/Deckify/commit/d60420204545a1423597a45db0eb4e824b0aecc5))
* Persist roadmap filter date in local storage and update README to document new persistence features. ([f6f274d](https://github.com/alexxx-v/Deckify/commit/f6f274d054d1380cec49761158bfcb88f79fedb7))
* Reduce height of draggable task bars and sidebar task items, and adjust styling for view mode buttons. ([f7a54dd](https://github.com/alexxx-v/Deckify/commit/f7a54dd83368b09c4dbb5182546ed74c60e60e77))
* replace @uiw/react-md-editor with Tiptap rich-text editor ([675e1c6](https://github.com/alexxx-v/Deckify/commit/675e1c64245fe9a4ff014d531806bc065d594239))
* save task without navigating back to list ([73671bd](https://github.com/alexxx-v/Deckify/commit/73671bd087636d3d2cb25a6ba3bfecb70c3cd8e1))
* setup app versioning, updater, db migrations, and release pipeline ([eb61e35](https://github.com/alexxx-v/Deckify/commit/eb61e3546dd8e1d63d44b92ed5ca4df79923ab9f))
* support task grouping and title wrapping in PDF roadmap export ([a200bc4](https://github.com/alexxx-v/Deckify/commit/a200bc436db69c8c00188f31a1f655cd2ca219c7))


### Bug Fixes

* replace regex HTML parser with DOMParser for correct nested list rendering ([eab6db7](https://github.com/alexxx-v/Deckify/commit/eab6db7c29bcbc2a5449bd1870281ac22a1c9563))
