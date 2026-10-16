/* Lightweight offline XLSX writer — no CDN required */
(function(){
  function escXml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
  function colName(n){let s=''; n++; while(n){let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26);} return s;}
  function crc32(bytes){let table=crc32.table;if(!table){table=crc32.table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}}let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=table[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  function u16(v){return new Uint8Array([v&255,(v>>>8)&255]);}
  function u32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]);}
  function concat(parts){let n=parts.reduce((a,b)=>a+b.length,0),o=new Uint8Array(n),p=0;for(const x of parts){o.set(x,p);p+=x.length;}return o;}
  function zip(files){
    const enc=new TextEncoder(), local=[], central=[]; let offset=0;
    for(const f of files){const name=enc.encode(f.name), data=typeof f.data==='string'?enc.encode(f.data):f.data, crc=crc32(data);
      const h=concat([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]); local.push(h);
      const c=concat([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]); central.push(c); offset+=h.length; }
    const cd=concat(central), body=concat(local); const e=concat([new Uint8Array([80,75,5,6]),new Uint8Array(18)]); const view=new DataView(e.buffer); view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,cd.length,true);view.setUint32(16,body.length,true); return concat([body,cd,e]);
  }
  function sheetXml(rows){
    let out='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    rows.forEach((row,ri)=>{out+='<row r="'+(ri+1)+'">'; row.forEach((v,ci)=>{const val=v==null?'':String(v); if(typeof v==='number'&&isFinite(v)) out+='<c r="'+colName(ci)+(ri+1)+'"><v>'+escXml(v)+'</v></c>'; else out+='<c r="'+colName(ci)+(ri+1)+'" t="inlineStr"><is><t>'+escXml(val)+'</t></is></c>';}); out+='</row>';});
    return out+'</sheetData></worksheet>';
  }
  function buildXlsx(wb){
    const files=[], sheets=wb.SheetNames.map((name,i)=>{const ws=wb.Sheets[name];return {name,rows:ws.__rows||[]};});
    files.push({name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'});
    files.push({name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'});
    files.push({name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((x,i)=>'<sheet name="'+escXml(x.name.slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'});
    files.push({name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>'});
    files.push({name:'xl/styles.xml',data:'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>'});
    sheets.forEach((x,i)=>files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheetXml(x.rows)})); return zip(files);
  }
  window.XLSX={version:'offline-1.0',utils:{book_new(){return {SheetNames:[],Sheets:{}}},json_to_sheet(rows){const keys=rows.length?Object.keys(rows[0]):[];const data=[keys,...rows.map(r=>keys.map(k=>r[k]))];return {__rows:data}},book_append_sheet(wb,ws,name){wb.SheetNames.push(name);wb.Sheets[name]=ws}},toBytes(wb){return buildXlsx(wb)},writeFile(wb,name){const blob=new Blob([buildXlsx(wb)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name.endsWith('.xlsx')?name:name+'.xlsx';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}};
})();
