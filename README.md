# 태수의 개발 노트

Markdown·MDX를 글의 원본으로 사용하는 Astro + Starlight 개인 블로그입니다.
글 목록과 태그 페이지를 빌드할 때 생성하고, GitHub Actions로 GitHub Pages에 배포합니다.

블로그: **[blog.taisu.site](https://blog.taisu.site/)**

## GitHub에서 글 관리하기

별도 프로그램 설치 없이 이 저장소의 파일 편집 기능으로 글을 관리할 수 있습니다.

### 새 글 작성

1. [글 템플릿](templates/post.md)의 내용을 복사합니다.
2. 주제에 맞는 링크를 열어 파일 이름을 `my-post.md`처럼 입력하고 템플릿을 붙여 넣습니다.
   - [개발 글 작성](https://github.com/parktaesu123/blog/new/main/src/content/docs/development)
   - [TIL 작성](https://github.com/parktaesu123/blog/new/main/src/content/docs/til)
   - [일상·회고 작성](https://github.com/parktaesu123/blog/new/main/src/content/docs/life)
3. 제목, 소개, 발행일, 태그와 본문을 작성합니다. 발행일은 실제 발행 날짜로 바꿉니다.
4. 발행하려면 `draft: true`와 `sidebar: hidden: true` 설정을 삭제합니다. 초안으로 보관하려면 그대로 둡니다.
5. **Commit changes**에서 `main`에 저장합니다. [Actions](https://github.com/parktaesu123/blog/actions)에서 배포가 완료되면 사이트에 반영됩니다.

본문 작성 예시는 아래 `글 쓰기` 항목을 참고합니다. 파일 이름은 짧은 영문으로 정하는 편이 좋습니다.
초안은 블로그의 목록·검색·메뉴에 표시되지 않지만, 공개 GitHub 저장소에서는 파일을 볼 수 있습니다.

### 수정

블로그 글 아래의 **페이지 편집** 링크를 누르거나, [글 폴더](https://github.com/parktaesu123/blog/tree/main/src/content/docs)에서 파일을 열고 연필 버튼을 누릅니다.
본문을 수정하고 필요하면 `updatedAt: 2026-10-07T18:00:00+09:00`을 추가한 뒤 커밋합니다.
`publishedAt`은 기존 발행일을 유지합니다. 파일 이름을 바꾸면 URL과 연결된 댓글도 달라지므로 그대로 유지합니다.

### 비공개로 전환하거나 삭제

- **발행 취소**: 글에 `draft: true`와 `sidebar: { hidden: true }`를 추가하고 커밋합니다.
- **삭제**: GitHub에서 해당 파일을 열고 파일 메뉴의 **Delete file**로 삭제한 뒤 커밋합니다.
- 삭제·수정한 내용은 Git 커밋 이력에서 복구할 수 있습니다.
- 글을 삭제해도 댓글 Discussion은 남습니다. 댓글까지 정리하려면 [Discussions](https://github.com/parktaesu123/blog/discussions)에서 해당 글의 토론을 관리합니다.

## 실행

Node.js 22.12 이상과 Bun 1.3.2를 사용합니다.

```sh
bun install --frozen-lockfile
bun run dev
```

```sh
bun run check  # 콘텐츠 스키마와 Astro/TypeScript 검사
bun run build  # 정적 페이지 생성과 결과물 링크 검사
bun run preview # 빌드 결과 미리보기 (검색 포함)
```

검색 인덱스는 빌드 시 생성되므로 검색 동작은 `preview`에서 확인합니다.

## 구조

```text
blog.config.mjs             블로그 이름·소개
giscus.json                 댓글을 표시할 수 있는 도메인
templates/post.md           새 글 템플릿 (블로그에 배포되지 않음)
astro.config.mjs            프레임워크·메뉴·배포 경로 설정
src/content.config.ts      글 메타데이터 스키마
src/content/docs/          Markdown·MDX 콘텐츠
  index.mdx                홈
  about.md                 소개
  development/             개발 글
  til/                     짧은 학습 기록
  life/                    일상·회고
src/components/            글 목록·제목 등 화면 컴포넌트
src/utils/                 글 조회·날짜·경로 처리
src/pages/posts/           전체 글 목록
src/pages/tags/            빌드 시 생성하는 태그 페이지
scripts/check-build.mjs    빌드 결과 검증
.github/workflows/         자동 배포
```

## 글 쓰기

적절한 폴더에 `.md` 또는 `.mdx` 파일을 추가합니다. 파일 경로가 글 주소가 됩니다.
예를 들어 `src/content/docs/til/my-note.md`는 `/til/my-note/`로 생성됩니다.

```yaml
---
title: 새 글의 제목
description: 목록과 검색 결과에 표시할 짧은 설명
publishedAt: 2026-10-07T09:00:00+09:00
tags:
  - JavaScript
  - TIL
---
```

그 아래에 본문을 작성합니다. MDX에서는 Astro 컴포넌트를 가져와 사용할 수 있습니다.
`publishedAt`이 있는 문서는 글 목록에 포함됩니다. 소개·홈 같은 일반 페이지에서는 생략합니다.
수정일은 `updatedAt`으로 별도 기록합니다. 작성일은 수정해도 유지합니다.
작성 중인 글에는 `draft: true`와 `sidebar: { hidden: true }`를 넣습니다.
발행할 때 두 설정을 제거하면 목록·메뉴·태그·검색에 포함됩니다.

첫 공개 글은 실제 블로그 구축 과정을 정리한 글입니다. 이전 TIL·회고 예시는 초안으로 보관했습니다.
큰 사이드바 지연 로딩이나 외부 TIL 동기화는 필요해질 때 추가할 수 있습니다.
Starlight 내부 소스를 복사하지 않고 공개 확장 API를 사용합니다.

## 댓글과 좋아요

[Giscus 앱](https://github.com/apps/giscus)을 `parktaesu123/blog` 저장소에 설치하고 댓글·반응 기능을 활성화했습니다.
발행한 글 아래에 Giscus를 표시합니다. 방문자는 GitHub 계정으로 로그인해 댓글과 반응(좋아요, 하트 등)을 남깁니다.
댓글은 `parktaesu123/blog` 저장소의 **Announcements** Discussion에 저장됩니다.
글 주소를 기준으로 연결하며, 첫 댓글이나 반응이 달릴 때 토론이 생성됩니다.
홈·소개·글 목록과 초안에는 댓글을 표시하지 않습니다.

- 설정: `blog.config.mjs`의 `comments`와 `repository`
- 특정 글에서 끄기: frontmatter에 `comments: false`
- 전체 블로그에서 끄기: `comments.enabled: false`
- 댓글 관리: [GitHub Discussions](https://github.com/parktaesu123/blog/discussions)
- 테마: 블로그의 밝은/어두운 설정을 따릅니다.
- 도메인을 바꿀 때는 `giscus.json`의 `origins`도 변경합니다.

GitHub 저장소에 Discussions가 활성화되어 있고 [Giscus 앱](https://github.com/apps/giscus)이 이 저장소에 설치되어 있어야 작동합니다.
저장소 ID와 카테고리 ID는 공개 설정값이며 비밀번호나 토큰을 사이트 코드에 넣지 않습니다.

## GitHub Pages 배포

1. 이 프로젝트 전체를 GitHub 저장소의 `main` 브랜치에 올립니다. `bun.lock`도 포함합니다.
2. 저장소의 **Settings → Pages → Source**에서 **GitHub Actions**를 선택합니다.
3. `main`에 커밋하면 검증·빌드·배포가 실행됩니다.

현재 공식 주소는 **https://blog.taisu.site/**이며 `blog.config.mjs`에서 관리합니다.
개인 도메인을 사용하지 않으려면 `blog.site` 설정을 제거합니다.
그 경우 워크플로가 `GITHUB_REPOSITORY`를 읽어 사이트 주소와 하위 경로를 자동 설정합니다.

- `owner/blog` → `https://owner.github.io/blog/`
- `owner/owner.github.io` → `https://owner.github.io/`

다른 브랜치를 사용하면 `deploy.yml`의 `branches`를 변경합니다.

### 개인 도메인

`blog.config.mjs`의 `site`에 도메인을 설정하고 GitHub Pages의 Custom domain에도 같은 도메인을 입력합니다.
GitHub Actions 방식으로 배포하므로 `public/CNAME` 파일은 필요 없습니다.

현재 Cloudflare에서 필요한 DNS 레코드는 다음과 같습니다.

| 유형 | 이름 | 대상 | 프록시 |
| --- | --- | --- | --- |
| CNAME | blog | parktaesu123.github.io | DNS only (회색 구름) |

대상에는 `https://`나 `/blog/`를 넣지 않습니다. DNS가 연결되면 GitHub Pages에서 HTTPS 인증서를 발급합니다.
인증서가 준비되면 Pages 설정에서 Enforce HTTPS를 활성화합니다.

임시로 다른 주소에서 빌드하려면 `PUBLIC_SITE_URL`, `PUBLIC_BASE_PATH` 환경 변수 또는
GitHub Actions Repository Variables로 설정을 덮어쓸 수 있습니다.

### 하위 경로 검증

```sh
PUBLIC_SITE_URL=https://example.github.io PUBLIC_BASE_PATH=/blog/ bun run build
```

모든 내부 링크와 정적 파일이 `/blog/` 경로를 포함하는지 검사합니다.
로컬에서도 같은 환경 변수로 빌드한 뒤 미리보기를 실행하면 하위 경로를 재현할 수 있습니다.

구현 구조 참고: https://github.com/rlaisqls/blog
콘텐츠와 구현 코드는 이 프로젝트에 맞게 새로 작성했습니다.
