"""Convert user-saved OfferFlow HTML snapshots into a JobFlow JSON backup.

Usage: python scripts/import_offerflow_html.py data/offerflow-applications.html data/面试记录.html data/offerflow-jobflow.json
Requires: beautifulsoup4. All processing is local; no network access.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5
from bs4 import BeautifulSoup

STAGES = {'未投递', '已投递', '简历通过', '一面', '二面', 'HR面', 'Offer', '已拒', '无回复'}

def tidy(s):
    s = ' '.join(s.split())
    return '' if s in ('未填写', '未分类', '-', '—') else s

def soup(path):
    return BeautifulSoup(Path(path).read_text(encoding='utf-8'), 'html.parser')

def applications(html):
    table = html.select_one('main table')
    if not table:
        raise ValueError('岗位页面没有找到表格；请检查保存的是否为岗位投递页面')
    headings = [th.get_text(' ', strip=True) for th in table.select('thead th')]
    expected = ['公司', '职位', '岗位类型', '投递时间', '状态', '简历版本', '渠道', '部门', '备注', '面试', '操作']
    if headings != expected:
        raise ValueError(f'岗位表头已改变：{headings}')
    result = []
    for index, row in enumerate(table.select('tbody tr')):
        cells = [td.get_text(' ', strip=True) for td in row.find_all('td', recursive=False)]
        if len(cells) != len(expected):
            raise ValueError(f'第 {index+1} 行列数异常')
        company, position, job_type, applied, stage, resume, channel, dept, notes, _interview, _actions = cells
        if not company or not position or stage not in STAGES or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', applied):
            raise ValueError(f'第 {index+1} 行缺少公司、职位、合法状态或投递日期')
        app_id = str(uuid5(NAMESPACE_URL, f'offerflow:application:{company}:{position}:{applied}:{index}'))
        result.append(dict(id=app_id, company=company, position=position, stage=stage,
                           channel=tidy(channel), url='', appliedAt=applied, notes=tidy(notes),
                           jobType=tidy(job_type), department=tidy(dept), resumeVersion=tidy(resume),
                           createdAt=f'{applied}T12:00:00'))
    main_text = html.select_one('main').get_text(' ', strip=True)
    match = re.search(r'共\s*(\d+)\s*条', main_text)
    if match and len(result) != int(match.group(1)):
        raise ValueError(f'岗位数量不一致：页面显示 {match.group(1)}，表格只有 {len(result)}')
    return result

def interviews(html, apps):
    main = html.select_one('main')
    if not main:
        raise ValueError('面试页面没有找到 main')
    text = main.get_text(' ', strip=True)
    match = re.search(r'共\s*(\d+)\s*家公司\s*·\s*(\d+)\s*次面试', text)
    groups = main.select('.space-y-4 > .bg-white.border')
    if not groups and match and int(match.group(1)):
        raise ValueError('面试页面有记录，但未找到面试卡片')
    result = []
    for group in groups:
        top = group.select_one(':scope > button')
        if not top:
            raise ValueError('面试卡片缺少岗位标题')
        title = top.select_one('.flex-1.text-left')
        names = title.select('span') if title else []
        if len(names) < 2:
            raise ValueError('面试卡片未能识别公司与职位')
        company, position = [el.get_text(' ', strip=True) for el in names[:2]]
        matched = [a for a in apps if a['company'] == company and a['position'] == position]
        if len(matched) != 1:
            raise ValueError(f'面试无法唯一关联岗位：{company} · {position}，匹配到 {len(matched)} 条')
        rounds = group.select('.relative.pl-10 > .bg-white.border')
        for number, card in enumerate(rounds, 1):
            button = card.select_one(':scope > button')
            if not button:
                raise ValueError('面试轮次缺少摘要')
            stage_label = button.select_one('span.font-semibold')
            date = re.search(r'\b\d{4}-\d{2}-\d{2}\b', button.get_text(' ', strip=True))
            if not stage_label or not date:
                raise ValueError('面试轮次缺少阶段或日期；不推测时间')
            stage = stage_label.get_text(' ', strip=True)
            state = button.get_text(' ', strip=True).split(date.group(0), 1)[-1].strip()
            # Saved HTML has this round collapsed; do not claim unseen interview feedback was imported.
            result.append(dict(id=str(uuid5(NAMESPACE_URL, f'offerflow:interview:{matched[0]["id"]}:{number}:{stage}:{date.group(0)}')),
                title=f'{stage} · 面试', type='面试', applicationId=matched[0]['id'],
                start=date.group(0), end='', allDay=True,
                completed=date.group(0) < datetime.now().date().isoformat(),
                notes=f'OfferFlow 面试记录；结果：{state or "未记录"}。原始 HTML 仅含日期，未提供具体时间。'))
    if match and len(result) != int(match.group(2)):
        raise ValueError(f'面试数量不一致：页面显示 {match.group(2)}，可解析 {len(result)}')
    return result

def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    apps = applications(soup(sys.argv[1]))
    events = interviews(soup(sys.argv[2]), apps)
    output = {'version': 1, 'exportedAt': datetime.now().astimezone().isoformat(), 'applications': apps, 'events': events}
    Path(sys.argv[3]).write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'完成：{len(apps)} 条岗位、{len(events)} 条面试日程 → {sys.argv[3]}')
    print('注意：简历只迁移版本名称；网页未展开的 JD、面试复盘和附件未迁移。')

if __name__ == '__main__':
    main()
