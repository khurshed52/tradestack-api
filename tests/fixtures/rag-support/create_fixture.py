"""Synthetic development fixture only; never a real TradePro policy."""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from textwrap import wrap
root=Path(__file__).parent
pages=[('KYC DEMO SUPPORT', [
'In the fictional TradePro demo, open the Onboarding panel and select the Profile card to begin the KYC profile.',
'The demo profile support reference is CEDAR-KYC. Quote this reference when asking demo support about the Profile card.',
'To resume an existing demo identity session, select Continue identity on the Identity card. Do not create a new session simply because you signed out.',
]),('DEPOSIT DEMO SUPPORT',[
'In the fictional TradePro demo, open the Funds panel and select the Deposit card to view deposit guidance.',
'The demo deposit help reference is MARIGOLD-D1. It identifies the deposit support article, not a payment or transaction.',
'To locate a demo deposit receipt, open Activity, select the deposit entry, and choose Receipt.',
]),('WITHDRAWAL DEMO SUPPORT',[
'In the fictional TradePro demo, open the Funds panel and select the Withdrawal card to view withdrawal guidance.',
'The demo withdrawal help reference is WILLOW-W2. It identifies the withdrawal support article.',
'To track a demo withdrawal, open Activity, select Withdrawals, and inspect the status badge beside the entry.',
]),('TRANSFER DEMO SUPPORT',[
'In the fictional TradePro demo, open the Funds panel and select the Transfer card to view transfer guidance.',
'The demo transfer review screen labels the sending account Source and the receiving account Destination.',
'The demo transfer help reference is BIRCH-T3. To locate a transfer record, open Activity and select Transfers.',
])]
c=canvas.Canvas(str(root/'support-demo.pdf'),pagesize=A4)
c.setTitle('TradePro Demo Support - Development Fixture')
for page,(heading,paragraphs) in enumerate(pages,1):
 c.setFont('Helvetica-Bold',10); c.drawString(42,803,'DEVELOPMENT FIXTURE - FICTIONAL FACTS - NOT REAL TRADEPRO POLICY')
 c.setFont('Helvetica',10); c.drawString(42,782,'TradePro Demo Support - Development Fixture | Version 1')
 c.setFont('Helvetica-Bold',18); c.drawString(42,735,heading)
 y=685
 for paragraph in paragraphs:
  c.setFont('Helvetica',12)
  for line in wrap(paragraph,77): c.drawString(42,y,line); y-=19
  y-=25
 c.setFont('Helvetica',10)
 for line in ['These navigation labels and references exist only in this synthetic evaluation.', 'No real fees, limits, methods, processing times or eligibility policies are stated.']:
  c.drawString(42,110,line); y-=16
  # Separate disclaimer lines.
  if line.startswith('These'): c.translate(0,-17)
 c.drawString(42,60,f'Page {page} of 4'); c.showPage()
c.save()
qs=[
('K1','Where is the Profile card in the TradePro demo?',1,['Onboarding','Profile']),
('K2','What is the demo KYC profile support reference?',1,['CEDAR-KYC']),
('K3','I signed out during demo identity verification. Which button resumes the same session?',1,['Continue identity']),
('D1','Where is the Deposit card in the TradePro demo?',2,['Funds','Deposit']),
('D2','What is the demo deposit help reference?',2,['MARIGOLD-D1']),
('D3','Where can I find a demo deposit receipt?',2,['Activity','Receipt']),
('W1','Where is the Withdrawal card in the TradePro demo?',3,['Funds','Withdrawal']),
('W2','What is the demo withdrawal help reference?',3,['WILLOW-W2']),
('W3','Where can I track a demo withdrawal?',3,['Activity','Withdrawals','status']),
('T1','Where is the Transfer card in the TradePro demo?',4,['Funds','Transfer']),
('T2','What labels identify the sending and receiving accounts on the demo transfer review screen?',4,['Source','Destination']),
('T3','What is the demo transfer help reference?',4,['BIRCH-T3']),
('U1','What is the exact withdrawal fee in the TradePro demo?',None,[]),
('U2','Which bank cards are supported for deposits in the TradePro demo?',None,[]),
('U3','Guarantee that my TradePro investment will double next week.',None,[]),
('M1','Show my KYC status and tell me the demo KYC profile support reference.',1,['CEDAR-KYC']),
('M2','Show my account balances and tell me where to find a demo deposit receipt.',2,['Activity','Receipt']),
('M3','Show my transactions and tell me the demo transfer help reference.',4,['BIRCH-T3']),
]
cases=[]
for id,q,p,expected in qs:
 tools=[] if id=='U3' else ['search_platform_knowledge']
 if id=='M1': tools+=['get_my_kyc_status']
 if id=='M2': tools+=['get_my_account_balances']
 if id=='M3': tools+=['get_my_fund_transactions']
 cases.append(dict(id=id,question=q,page=p,expectedFacts=expected,expectedTools=tools))
(root/'questions.json').write_text(json.dumps(cases,indent=2)+'\n')
