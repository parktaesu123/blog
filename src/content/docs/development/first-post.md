---
title: Markdown으로 시작하는 GitHub 블로그
description: Astro와 Starlight로 글을 관리하고 GitHub Pages로 배포하는 개인 블로그를 시작합니다.
publishedAt: 2026-10-07T09:00:00+09:00
tags:
  - 블로그
  - Astro
  - GitHub Pages
---

개발하면서 배운 것과 개인적인 기록을 남길 공간을 만들었습니다.
주소는 [blog.taisu.site](https://blog.taisu.site/)입니다.

## 글을 파일로 관리하기

글의 원본은 Markdown 또는 MDX 파일입니다. 별도의 데이터베이스 없이 GitHub 저장소에서
글을 작성하고 수정하며, 변경 이력도 함께 남깁니다.

글은 세 가지 주제로 나눕니다.

- **개발**: 구현 과정과 문제 해결
- **TIL**: 짧게 정리하는 학습 기록
- **일상·회고**: 경험과 생각을 돌아보는 개인 기록

## 커밋하면 배포되는 구조

Astro와 Starlight가 글 목록, 태그, 검색을 포함한 정적 사이트를 만듭니다.
`main` 브랜치에 변경 사항을 저장하면 GitHub Actions가 검사와 빌드를 실행한 뒤
GitHub Pages에 배포합니다. 개인 도메인은 HTTPS로 연결했습니다.

구현은 [GitHub 저장소](https://github.com/parktaesu123/blog)에서 확인할 수 있습니다.

## 작게 시작하기

완성된 결과뿐 아니라 시도한 방법과 선택한 이유를 함께 남기려 합니다.
한 가지 질문을 짧게 정리하는 것부터 시작합니다.
