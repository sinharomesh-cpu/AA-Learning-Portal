# Third-party notices

## Common-password list

`src/server/auth/data/common-passwords.txt` contains the entries of at least 8 characters,
lower-cased and de-duplicated, from `passwords.json` in `@zxcvbn-ts/language-common` 4.1.3
(used offline to refuse common and leaked passwords, OC-35). It is distributed under the MIT
licence:

> Copyright (c) 2012-2016 Dan Wheeler and Dropbox, Inc.
> Copyright (c) 2021 @zxcvbn-ts
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Material Symbols icons

`src/components/icons/symbols.ts` contains SVG path data for a selection of outlined icons
copied from `@material-symbols/svg-400` 0.48.0 (Google's Material Symbols, the icon set used by
the Stitch designs). The icons are distributed under the Apache License, Version 2.0:

> Copyright Google LLC
>
> Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file
> except in compliance with the License. You may obtain a copy of the License at
> https://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software distributed under the
> License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
> express or implied. See the License for the specific language governing permissions and
> limitations under the License.

## HEIC photo decoder

iPhone HEIC/HEIF photos uploaded for homework (CR-07, OC-90 Q-4) are converted to JPEG on the
server with `heic-decode` 2.1.0 (ISC licence), which uses `libheif-js` 1.23.2. `libheif-js` is
a WebAssembly build of libheif and libde265, distributed under the **GNU Lesser General Public
License, version 3** (https://www.gnu.org/licenses/lgpl-3.0.html). AA Pro uses it unmodified,
as a separate npm package loaded at run time (`serverExternalPackages` in `next.config.ts`), so
it can be replaced with any compatible build. Its source code is available from
https://github.com/catdad-experiments/libheif-js and https://github.com/strukturag/libheif.

> heic-decode — ISC License. Copyright (c) Kiril Vatev.
> Permission to use, copy, modify, and/or distribute this software for any purpose with or
> without fee is hereby granted, provided that the above copyright notice and this permission
> notice appear in all copies.
