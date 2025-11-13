# Product Operations Data Integration Blueprint (2025-11)

## 1. 배경 및 목적
- Product 조직이 사용하는 Jira · Confluence · GitHub · Figma를 하나의 데이터 흐름으로 엮어 관리하는 방법을 정의합니다.
- 2025-11-13 기준 Jira API(`/rest/api/3/search/jql`) 결과, 활성 티켓은 존재하지 않으며 참조용으로 [PRD-1016](https://athometrip.atlassian.net/browse/PRD-1016) (템플릿)과 [PRD-1017](https://athometrip.atlassian.net/browse/PRD-1017) (예시)만 Backlog 상태로 등록되어 있습니다.
- 모든 자동화 스크립트와 데이터 호출은 `.env`에 저장된 `ATLASSIAN_EMAIL`, `CONFLUENCE_API_TOKEN`, `FIGMA_PERSONAL_ACCESS_TOKEN`, `GITHUB_TOKEN`을 사용하여 실제 운영 환경과 동기화합니다.

## 2. End-to-End Data Integration Architecture
1. **Jira (Author = PM)** – 기능 티켓을 생성하고 Description 템플릿(Problem / Hypothesis / Figma Node / Git Branch / Confluence Spec)을 작성합니다. 여기서 `Confluence Spec`은 CTO가 작성·유지합니다.
2. **Confluence (Author = CTO)** – 개별 이슈 스펙은 제목에 Jira 키를 포함해 양방향 추적성을 확보합니다. 반면, 본 문서처럼 여러 이슈를 다루는 운영 가이드는 키 없이 관리해도 무방합니다.
3. **GitHub (Owner = Dev)** – Jira 키를 브랜치(`feature/PRD-XXXX-*`), 커밋, PR 제목에 포함하면 Jira Description의 `Git Branch` 필드와 즉시 연결됩니다.
4. **Figma (Owner = Design)** – Dev Mode에서 화면 이름 또는 주석에 Jira 키를 표기하면, Jira Description의 `Figma Node` 항목이 해당 노드 링크를 가리킵니다.
5. 위 4단계 데이터는 PM/CTO가 회의록이나 보고서를 작성할 때 Jira 화면 하나로 확인할 수 있으며, 추가 스크립트 없이도 근거를 확보할 수 있습니다.

## 3. Product 회의체 (월·목·금)
| 회의 | 시점 | 준비 | 산출물 |
| --- | --- | --- | --- |
| 월요일 Kick-off | 주간 시작 | 이번 주에 진행할 티켓을 Jira에 등록·공유 | 이번 주 작업 목록 |
| 목요일 진행 공유 | 주중 | 각 티켓의 진행 상황·이슈를 Jira 코멘트로 정리 | 필요한 액션을 해당 티켓 체크리스트에 기록 |
| 금요일 Wrap (CTO) | 주간 종료 | CTO가 Jira · Confluence 데이터를 기반으로 주간 보고 작성 | 주간 회고/보고 자료 |

## 4. 케이스 스터디 – PRD-874 홈-메인
- Jira: `PRD-874 · 홈-메인 신규메인`
- Git: `feature/PRD-874-home-main`, 커밋 `476357a`
- Figma: 파일 `PuaTrGTcY3Q5OU7UFClAOo`, 노드 `337:158`
- Confluence: `[Brief] 앳홈트립 네이티브 랜딩페이지 리디자인_250331`

Jira Description, Git 브랜치, Figma 라벨에 같은 키를 유지하므로 추가 스냅샷 없이도 히스토리를 재구성할 수 있습니다.

## 5. 템플릿 규칙
| 항목 | 규칙 | 예시 |
| --- | --- | --- |
| Jira Summary | `[기능/페이지] + 작업` | `홈 메인 / 미니 배너 교체` |
| Jira Description | `Problem`, `Hypothesis`, `Figma Node`, `Git Branch`, `Confluence Spec` | `Figma Node: 337:158`<br>`Git Branch: feature/PRD-874-home-main` |
| Git Branch | `feature/<Jira키>-<설명>` | `feature/PRD-1014-mypage` |
| Git PR | `[Jira키] 요약` | `[PRD-1010] SEO 메타 태그 캐싱` |
| Figma 라벨 | 캔버스/노드 이름에 Jira 키 포함 | `PRD-1010 SEO 메타` |

참고 티켓: 템플릿 [PRD-1016](https://athometrip.atlassian.net/browse/PRD-1016) / 적용 예시 [PRD-1017](https://athometrip.atlassian.net/browse/PRD-1017)

## 6. Action Items (현 시점 기준)
| 작업자 | 지시 사항 |
| --- | --- |
| PM | 새로운 업무가 생기면 즉시 Jira 티켓을 만들고 Description 템플릿을 채워 월요일 Kick-off에 공유합니다. 현재 PRD-1016/1017 외에 진행 티켓이 없음을 유지합니다. |
| 개발자 | 향후 생성될 브랜치/커밋/PR에 Jira 키를 포함하도록 Git naming 규칙을 미리 정리하고, 기존 레포(`athometrip-front`, `athometrip-springboot`)에도 동일 규칙을 적용합니다. |
| 디자이너 | Figma Dev Mode에서 사용하는 주요 캔버스에 Jira 키 라벨을 붙이고, PM이 Description의 `Figma Node` 항목에 해당 링크를 넣을 수 있도록 지원합니다. |
| CTO | 각 티켓의 Confluence Spec을 작성·관리하고, 금요일 Wrap에서 Jira/Confluence 데이터를 근거로 주간 보고를 발행합니다. |

---
작성자: 김선호 CTO · 최종 업데이트: 2025-11-13
