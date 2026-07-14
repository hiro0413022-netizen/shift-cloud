    c = ws.cell(row=rr, column=5, value=f'=SUM(Monthly_PL!${col}$4:${col}$39)')
    c.font=f_link; c.number_format=YEN; c.border=border
    rr += 1
label(ws, f'A{rr+1}', '■ 主要指標', sub=True)
kmap = [
    ('期末会員数(36ヶ月)', '=Monthly_PL!$G$39', '#,##0'),
    ('損益分岐点会員数', '=BreakEven!$B$8', '#,##0'),
    ('現状-BEP会員差', '=Monthly_PL!$G$39-BreakEven!$B$8', '#,##0'),
]
r = rr+2
for lb, val, fmt in kmap:
    label(ws, f'A{r}', lb); calc(ws, f'B{r}', val, fmt, link=True); r += 1
ws.column_dimensions['A'].width=26
for col in 'BCDE': ws.column_dimensions[col].width=15
ws['A'+str(r+2)] = '注: 数値は仮置き前提に基づく初版。実データ確定で更新。'; ws['A'+str(r+2)].font=f_note

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '03_FRANK_GOLF収支計画.xlsx')
wb.save(out)
print('SAVED', out)
