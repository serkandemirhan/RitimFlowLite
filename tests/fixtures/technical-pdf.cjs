// Deterministic, three-page vector fixture with fine grids and dimensions.
// Kept independently from disposable screenshots and reports.
module.exports=function technicalPdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>'];
 for(let page=1;page<=3;page++){
  const stream=['0.3 w','0.7 G',...Array.from({length:30},(_,i)=>`${30+i*18} 60 m ${30+i*18} 720 l S`),...Array.from({length:36},(_,i)=>`30 ${60+i*18} m 570 ${60+i*18} l S`),'0 G','2 w','110 260 380 200 re S','150 290 300 140 re S','BT /F1 16 Tf 40 760 Td (TECHNICAL TEST - PAGE '+page+') Tj ET','BT /F1 8 Tf 200 245 Td (380.00 +/- 0.05 mm) Tj ET',...Array.from({length:18},(_,i)=>`BT /F1 6 Tf 40 ${690-i*22} Td (DIM ${i+1}: ${page*10+i}.025 mm - tolerance 0.005) Tj ET`)].join('\n');
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 9 0 R >> >> /Contents ${objects.length+2} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
 }
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n'});const xref=Buffer.byteLength(pdf);pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(pdf);
};
