---
title: 배열을 변환하는 map
description: 배열의 각 값을 변환해 새 배열을 만드는 JavaScript 메서드를 정리한 예시입니다.
publishedAt: 2026-10-06T09:00:00+09:00
draft: true
sidebar:
  hidden: true
tags:
  - JavaScript
  - TIL
---

블로그 작성을 연습하기 위한 예시 글입니다.

## 기본 사용법

`map`은 배열의 각 요소에 함수를 적용하고 그 결과로 새 배열을 만듭니다.

```js title="example.js"
const numbers = [1, 2, 3];
const doubled = numbers.map((number) => number * 2);

console.log(doubled); // [2, 4, 6]
console.log(numbers); // [1, 2, 3]
```

## 주의할 점

`map` 자체는 원본 배열을 바꾸지 않습니다. 하지만 콜백에서 객체를 직접 수정하면 원본 객체도 바뀔 수 있습니다.
객체를 변환할 때는 새 객체를 반환할지 함께 생각해야 합니다.
