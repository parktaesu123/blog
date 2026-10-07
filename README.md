# 개발 노트

Markdown·MDX를 글의 원본으로 사용하는 Astro + Starlight 개인 블로그입니다.
글 목록과 태그 페이지를 빌드할 때 생성하고, GitHub Actions로 GitHub Pages에 배포합니다.

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

초기 글들은 사용법을 보여주는 예시이며 자유롭게 교체할 수 있습니다.
큰 사이드바 지연 로딩이나 외부 TIL 동기화는 필요해질 때 추가할 수 있습니다.
Starlight 내부 소스를 복사하지 않고 공개 확장 API를 사용합니다.

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
