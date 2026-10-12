"""Compile individually authored, source-reviewed history faculty research exercises.

The JSON is an authored input, not a topic-to-question generator. Existing rows and
IDs are retained; only this dated layer is rebuilt on each run.
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUT = Path(__file__).with_name('history-expansion-20261013.json')
DATE = '2026-10-13'
MARKER = '-research-history-20261013-'


def sources(subject):
    payload = json.loads(INPUT.read_text())
    assert payload['schemaVersion'] == 1 and payload['date'] == DATE
    return [row for row in payload['sources'] if row['subject'] == subject]


def apply(report):
    subject = report['subject']
    additions = sources(subject)
    if not additions:
        return report
    notes = {n['id']: n for n in json.loads(
        (ROOT / f'public/data/subjects/{subject}/notes.json').read_text())}
    faculty_ids = {row['faculty']['id'] for row in additions}
    paper_ids = {row['paper']['id'] for row in additions}
    report['faculty'] = [f for f in report['faculty'] if f['id'] not in faculty_ids]
    report['papers'] = [p for p in report['papers'] if p['id'] not in paper_ids]
    report['predictions'] = [q for q in report['predictions'] if MARKER not in q['id']]
    old_count = len(report['predictions'])
    count = 0
    for row in additions:
        faculty, paper = copy.deepcopy(row['faculty']), copy.deepcopy(row['paper'])
        assert faculty['departmentKind'] == 'history' and faculty['officialUrls']
        assert paper['facultyIds'] == [faculty['id']]
        assert paper['id'] in faculty['paperIds']
        assert paper['readScope'] == 'abstract' and paper['summary'] and paper['url']
        assert len(row['questions']) == 3
        report['faculty'].append(faculty)
        report['papers'].append(paper)
        for source in row['questions']:
            count += 1
            tasks, points = source['tasks'], source['points']
            assert len(tasks) == len(points) == 3 and all(len(p) == 2 for p in points)
            criteria = []
            for i, (task, pair) in enumerate(zip(tasks, points)):
                weights = [1, 2] if i < 2 else [2, 2]
                criteria.append({
                    'id': f'r{i + 1}', 'label': task, 'max': sum(weights),
                    'checkpoints': [{'text': text, 'points': weight} for text, weight in zip(pair, weights)],
                    'allowedScores': [0, 1, 2, 3] if i < 2 else [0, 2, 4],
                    'scoringNote': '표시된 체크포인트 점수를 독립 합산한다. 같은 뜻의 표현과 자료에 맞는 동등한 대안을 인정한다. 예시 자료명 자체를 필수 암기 정답으로 요구하지 않는다.',
                })
            evidence = []
            if source['anchor']:
                number, quote = source['anchor']
                page = f'{subject}-textbook-page-{number}'
                assert quote in notes[page]['text'], (page, quote)
                evidence.append({'page': page, 'quote': quote})
            basis = '교재 인용은 배경 주제의 근거이며 연구의 해석 자체를 입증하는 인용이 아니다.' if evidence else '직접 대응하는 교재 근거는 확인하지 못해 sourcePages와 evidence를 비워 두었다. 공개 논문 초록의 관점을 제시한 심화 적용 과제다.'
            report['predictions'].append({
                'id': f'{subject}{MARKER}{count:03}',
                'title': source['title'], 'topic': paper['reviewTheme'],
                'type': 'essay', 'skill': 'source-analysis',
                'prompt': '[공개 논문 초록의 관점을 제공한 자체 구성 과제]\n' + source['context'] + '\n\n' + '\n'.join(f'{i + 1}. {task}' for i, task in enumerate(tasks)),
                'modelAnswer': '\n'.join(f'{i + 1}. ' + ' '.join(pair) for i, pair in enumerate(points)),
                'criteria': criteria, 'paperIds': [paper['id']],
                'sourceReadScopes': [{'paperId': paper['id'], 'scope': paper['readScope'], 'locator': paper['readDetails']}],
                'sourcePages': [e['page'] for e in evidence], 'evidence': evidence,
                'linkedQuestionIds': [],
                'forecast': {
                    'label': '출제 예상도(편집적 판단)', 'level': source['level'],
                    'assessmentScope': 'topic-connection; not exact-question probability',
                    'basis': [source['rationale'], basis],
                    'limitations': ['교재 주제와 연구 관점의 연결에 대한 편집적 판단이며 실제 출제 확률을 계산하지 않았다.', '공개 초록에서 확인한 범위만 제시한다. 연구자의 실제 출제위원 참여나 논문 전체의 검증을 뜻하지 않는다.'],
                },
                'caution': paper['caution'] + ' 가상 자료·조사 상황은 연습용이며 해당 논문의 실제 조사 결과를 인용한 것이 아니다.',
                'exerciseKind': 'research-perspective-application',
                'passageProvenance': '확인한 공개 초록의 자체 요약 및 가상 적용 상황; 논문·역사 사료의 직접 인용이 아님',
                'officialGradingStatus': '자체 연습용 10점 기준; 평가원의 공식 채점 기준이 아님',
                'automaticExamEligible': False,
                'authoredAt': DATE,
            })
    for key in ('faculty', 'papers', 'predictions'):
        ids = [item['id'] for item in report[key]]
        assert len(ids) == len(set(ids)), (subject, key)
    report['asOf'] = DATE
    report['historyFacultyExpansion'] = {
        'date': DATE, 'preservedPredictions': old_count, 'addedFaculty': len(additions),
        'addedPapers': len(additions), 'addedPredictions': count,
        'totalPredictions': len(report['predictions']),
        'scope': '일반 역사학부·사학과·역사콘텐츠전공의 공식 현직 소속과 선정 논문을 확인. 새 논문은 모두 초록 전체 검토이며 전문 정독은 0편. 전체 업적 전수 조사 아님.',
        'officialProbability': False,
    }
    total = len(report['predictions'])
    if subject == 'seoyangsa':
        report['stats'].update(faculty=len(report['faculty']), bibliographicRecords=len(report['papers']),
                               coreAbstractReviews=sum(p.get('coreReview', False) and p['readScope'] == 'abstract' for p in report['papers']),
                               allCompleteAbstractReads=sum(p['readScope'] == 'abstract' for p in report['papers']), predictionEssays=total)
    elif subject == 'hanguksa':
        report['counts'].update(faculty=len(report['faculty']), corePapers=sum(p.get('coreReview', False) for p in report['papers']),
                                coreAbstractsRead=sum(p.get('coreReview', False) and p['readScope'] == 'abstract' for p in report['papers']), predictions=total)
    elif subject == 'dongyangsa':
        report['coverage'].update(facultyCount=len(report['faculty']), abstractReviews=sum(p['readScope'] == 'abstract' for p in report['papers']), researchPracticeEssays=total)
    return report


if __name__ == '__main__':
    for subject in ('seoyangsa', 'hanguksa', 'dongyangsa'):
        path = ROOT / f'knowledge/prediction-research/{subject}.json'
        report = apply(json.loads(path.read_text()))
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(subject, report['historyFacultyExpansion'])
