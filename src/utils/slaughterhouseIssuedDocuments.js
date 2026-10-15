'use strict';
// Emision documental: PDFs congelados en Postgres y QR verificable.
// Debe llamarse SOLO desde rutas protegidas por roles FRIGOSI.
const crypto = require('crypto');
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const {
  loadCommercialDocumentLines,
} = require('./slaughterhouseCommercialDocuments');
const {
  calculateSlaughterhouseCommission,
  resolveCommissionWeights,
  settleSlaughterhouseCommission,
} = require('./slaughterhouseCommission');

const rnd2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const money = v => `${Number(v).toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2})} Bs`;
const str = v => v == null ? '' : String(v);
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const formatDate = v => v ? new Intl.DateTimeFormat('es-BO', {timeZone:'America/La_Paz', day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v)) : '';
const safe = s => str(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const abbrev = value => str(value).trim().split(/\s+/).filter(Boolean).map(v=> `${v[0]}.`).join(' ');

async function toBuffer(produce) {
  const sink = new PassThrough();
  const chunks = [];
  sink.on('data', b => chunks.push(b));
  const finished = new Promise((resolve,reject) => {
    sink.on('finish', () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);
  });
  try { await produce(sink); } catch(e) { sink.destroy(e); }
  const buf = await finished;
  if (buf.length < 100 || buf.slice(0,5).toString() !== '%PDF-') {
    throw new Error('DOCUMENT_PDF_INVALID');
  }
  if (buf.length > 8 * 1024 * 1024) throw new Error('DOCUMENT_PDF_TOO_LARGE');
  return buf;
}

// Reutiliza el generador actual del ganadero, sin recomputar la compra.
async function existingSellerPdf(req, originalPdf, qr) {
  return toBuffer(async (sink) => {
    sink.setHeader = () => {};
    sink.headersSent = false;
    sink.status = (n) => { sink.httpStatus = n; return sink; };
    sink.json = (payload) => {
      sink.destroy(new Error(`DOCUMENT_SELLER_RENDER_ERROR: ${JSON.stringify(payload)}`));
      return sink;
    };
    await originalPdf({...req, documentVerification: qr}, sink);
  });
}

function pdfFactory({title,subtitle,rows,adjustments,totals,qr}) {
  return toBuffer(async (sink) => {
    const d = new PDFDocument({size:'A4', margin:46, bufferPages:true});
    d.pipe(sink);
    const W = d.page.width - 92;
    const ensure = n => {if (d.y+n > d.page.height-60) d.addPage();};
    const line = (label,val) => {
      const labelWidth=205;
      const content=str(val) || '-';
      const height=Math.max(d.heightOfString(str(label),{width:labelWidth,fontSize:9}),
        d.heightOfString(content,{width:W-labelWidth,fontSize:9}))+7;
      ensure(height+4);
      const y=d.y;
      d.font('Helvetica-Bold').fontSize(9).text(str(label),46,y,{width:labelWidth});
      d.font('Helvetica').fontSize(9).text(content,46+labelWidth,y,{width:W-labelWidth});
      d.y=y+height;
    };
    const section = t => {ensure(50); d.moveDown(0.5).font('Helvetica-Bold').fontSize(11).text(t); d.moveDown(0.35);};
    d.font('Helvetica-Bold').fontSize(15).text(title,{align:'center'});
    d.moveDown(.4).fontSize(9).font('Helvetica').text(subtitle,{align:'center'});
    d.moveDown(.6);
    section('IDENTIFICACIÓN');
    for(const [k,v] of rows) line(k,v);
    section('CÁLCULO DE LA OBLIGACIÓN');
    for(const [k,v] of totals) line(k,v);
    if (adjustments.length) {
      section('AJUSTES JUSTIFICADOS');
      for(const a of adjustments) {
        line(`${a.adjustment_type==='discount'?'Descuento':'Adición'}: ${str(a.description || a.code || 'Ajuste')}`,
          `${a.adjustment_type==='discount'?'-':'+'}${money(a.amount)}`);
      }
    }
    ensure(155);
    section('VERIFICACIÓN DOCUMENTAL');
    const y=d.y;
    d.image(qr.png,46,y,{width:95,height:95});
    d.font('Helvetica-Bold').fontSize(9).text('Documento certificado por Plaza Ganadera',153,y,{width:W-108});
    d.font('Helvetica').fontSize(8).text(`Código: ${qr.code}`,153,y+20,{width:W-108});
    d.text('Escanee el QR para comprobar vigencia e importe.',153,y+39,{width:W-108});
    d.text('Este documento no acredita que un pago haya sido realizado.',153,y+67,{width:W-108});
    d.y=y+110;
    d.end();
  });
}

async function loadContext(client, companyId, preliquidationId) {
  const r=await client.query(`
    SELECT sp.*, spl.lot_number, spl.expected_quantity, spl.seller_person_id,
      spl.commissioner_person_id, spl.commission_type, spl.commission_value,
      spl.planned_payment_date, spl.payment_terms,
      seller.full_name AS seller_name,
      COALESCE(approver.full_name,approver.name,approver.email) AS approved_by_name,
      commissioner.full_name AS commissioner_name,
      commissioner.document_type AS commissioner_document_type,
      commissioner.document_number AS commissioner_document_number,
      commissioner.phone AS commissioner_phone,
      method.method_type AS commissioner_payment_method_type,
      method.account_number AS commissioner_account_number,
      method.account_holder AS commissioner_account_holder,
      bank.name AS commissioner_bank_name
    FROM slaughterhouse_preliquidations sp
    JOIN slaughterhouse_purchase_lots spl ON spl.id=sp.purchase_lot_id
      AND spl.company_id=sp.company_id
    LEFT JOIN slaughterhouse_people seller ON seller.id=spl.seller_person_id
      AND seller.company_id=sp.company_id
    LEFT JOIN users approver ON approver.id=sp.approved_by
    LEFT JOIN slaughterhouse_people commissioner ON commissioner.id=
      CASE WHEN sp.source_snapshot::jsonb ? 'commissioner_person_id'
        THEN NULLIF(sp.source_snapshot::jsonb ->> 'commissioner_person_id','')::integer
        ELSE spl.commissioner_person_id END
      AND commissioner.company_id=sp.company_id
    LEFT JOIN LATERAL (
      SELECT pm.* FROM slaughterhouse_person_payment_methods pm
      WHERE pm.person_id=commissioner.id
      ORDER BY pm.is_default DESC,pm.id ASC LIMIT 1
    ) method ON true
    LEFT JOIN slaughterhouse_banks bank ON bank.id=method.bank_id
    WHERE sp.id=$1 AND sp.company_id=$2 LIMIT 1
  `,[preliquidationId,companyId]);
  if(!r.rowCount) {const e=new Error('Preliquidacion no encontrada');e.status=404;throw e;}
  return r.rows[0];
}

async function loadAdjustments(client, preliqId, companyId) {
  const r=await client.query(`
    SELECT a.* FROM slaughterhouse_preliquidation_adjustments a
    JOIN slaughterhouse_preliquidations sp ON sp.id=a.preliquidation_id
    WHERE a.preliquidation_id=$1 AND sp.company_id=$2 ORDER BY a.id
  `,[preliqId,companyId]);
  return r.rows;
}

async function loadTransport(client, p, negotiationId) {
  const r=await client.query(`
    SELECT tn.id AS negotiation_id, tn.trip_price,tn.status AS negotiation_status,
      tn.transporter_id, tr.id AS request_id, tr.origin, tr.destination,
      tr.travel_date, troop.troop_number, truck.plate, truck.brand, truck.model,
      COALESCE(person.full_name, u.full_name, u.name, u.email) AS transporter_name,
      person.document_type AS transporter_document_type,
      person.document_number AS transporter_document_number,
      person.phone AS transporter_phone,
      method.method_type AS payment_method_type,
      method.account_number, method.account_holder,
      bank.name AS bank_name
    FROM transport_negotiations tn
    JOIN transport_requests tr ON tr.id=tn.request_id
    JOIN LATERAL (
      SELECT st.troop_number,st.company_id
      FROM slaughterhouse_troops st
      WHERE st.company_id=$1 AND st.purchase_lot_id=$2
        AND st.transport_negotiation_id=tn.id AND st.status <> 'cancelled'
      ORDER BY st.id LIMIT 1
    ) troop ON true
    LEFT JOIN users u ON u.id=tn.transporter_id
    LEFT JOIN slaughterhouse_people person ON person.company_id=$1
      AND person.user_id=tn.transporter_id
    LEFT JOIN transporter_trucks truck ON truck.id=tn.truck_id
    LEFT JOIN LATERAL (
      SELECT pm.* FROM slaughterhouse_person_payment_methods pm
      WHERE pm.person_id=person.id ORDER BY pm.is_default DESC,pm.id LIMIT 1
    ) method ON true
    LEFT JOIN slaughterhouse_banks bank ON bank.id=method.bank_id
    WHERE tr.purchase_lot_id=$2 AND tn.id=$3
      AND COALESCE(tn.cancelled,false)=false
    LIMIT 1
  `,[p.company_id,p.purchase_lot_id,negotiationId]);
  if(!r.rowCount) {const e=new Error('Negociación de transporte no asociada al lote');e.status=404;throw e;}
  const x=r.rows[0];
  if(x.trip_price==null || Number(x.trip_price)<0) {
    const e=new Error('Transporte sin precio válido');e.status=409;throw e;
  }
  return x;
}

async function commissionFinancial(client,p,adj) {
  const source=p.source_snapshot&&typeof p.source_snapshot==='string'
    ?JSON.parse(p.source_snapshot):p.source_snapshot||{};
  const ctx = {
    ...p,
    commissioner_person_id: Object.hasOwn(source,'commissioner_person_id') ?
      source.commissioner_person_id : p.commissioner_person_id,
    commission_type: Object.hasOwn(source,'commission_type') ?
      source.commission_type : p.commission_type,
    commission_value: Object.hasOwn(source,'commission_value') ?
      source.commission_value : p.commission_value,
  };
  if(!ctx.commissioner_person_id||!ctx.commissioner_name||!ctx.commission_type||ctx.commission_value==null) {
    const e=new Error('Comisionista sin configuración aprobada');e.status=409;throw e;
  }
  // Si una compra ha cambiado sus términos tras aprobar, no reemitir con otros valores.
  // La base de kg vivo inicial corresponde al BRUTO de Campo sin destare.
  const commercial=await loadCommercialDocumentLines(client,p.company_id,p.purchase_lot_id,p);
  const slaughter=await client.query(`
    SELECT COALESCE(SUM(sc.hook_weight_kg),0) AS hook_kg,
      COUNT(DISTINCT (sc.troop_id,sc.animal_sequence_number))
        FILTER(WHERE sc.animal_sequence_number IS NOT NULL AND sc.half_number=1)
        AS slaughtered_modern,
      COUNT(*) FILTER(WHERE sc.animal_sequence_number IS NULL OR sc.half_number IS NULL)
        AS slaughtered_legacy
    FROM slaughterhouse_carcasses sc
    JOIN slaughterhouse_troops st ON st.id=sc.troop_id
      AND st.company_id=$1 AND st.purchase_lot_id=$2 AND st.status <> 'cancelled'
  `,[p.company_id,p.purchase_lot_id]);
  const sr=slaughter.rows[0];
  const hookKg=Number(sr.hook_kg);
  const slCount=Number(sr.slaughtered_modern)+Number(sr.slaughtered_legacy);
  const received=await client.query(`
    SELECT COALESCE(SUM(received_quantity),0) AS qty
    FROM slaughterhouse_troops
    WHERE company_id=$1 AND purchase_lot_id=$2 AND status <> 'cancelled'
  `,[p.company_id,p.purchase_lot_id]);
  const qty=Number(received.rows[0].qty);
  const weights=resolveCommissionWeights({
    sourceSnapshot:p.source_snapshot,receivedAnimals:qty,slaughteredAnimals:slCount,
    incompleteAnimals:Math.max(0,qty-slCount),hookWeightKg:hookKg,
    certifiedFieldGrossWeightKg:commercial?.gross_weight_total_kg??null,
    certifiedFieldWeightComplete:!!commercial?.gross_weight_complete && commercial.quantity===qty,
  });
  const calc=calculateSlaughterhouseCommission({
    commissionType:str(ctx.commission_type).toLowerCase().trim(),
    commissionValue:Number(ctx.commission_value),
    receivedAnimals:qty,sellerNetPayable:Number(p.total_payable),...weights,
  });
  const adjustments=adj.filter(a=>a.target_type==='commissioner' &&
    Number(a.commissioner_person_id)===Number(ctx.commissioner_person_id));
  const disc=rnd2(adjustments.filter(a=>a.adjustment_type==='discount').reduce((s,a)=>s+Number(a.amount),0));
  const add=rnd2(adjustments.filter(a=>a.adjustment_type==='addition').reduce((s,a)=>s+Number(a.amount),0));
  const settlement=settleSlaughterhouseCommission({
    calculation:calc,discountsTotal:disc,additionsTotal:add,
    overrideAmount:p.commission_override_amount==null?null:Number(p.commission_override_amount),
  });
  if(settlement.calculation_pending || settlement.base_calculation_pending ||
    !Number.isFinite(Number(settlement.net_payable)) || Number(settlement.net_payable)<0) {
    const e=new Error('La comisión tiene cálculos pendientes; no se puede certificar');e.status=409;throw e;
  }
  return {ctx,commercial,calc,adjustments,disc,add,settlement};
}

async function renderCommission(client,p,qr,adjustments) {
  const f=await commissionFinancial(client,p,adjustments);
  const name=f.ctx.commissioner_name;
  const rows=[
    ['Lote',p.lot_number],['Preliquidación',`#${p.id} · Versión ${p.version}`],
    ['Estado','OBLIGACIÓN APROBADA · NO ACREDITA PAGO'],
    ['Aprobado el',formatDate(p.approved_at)],['Aprobador',p.approved_by_name],
    ['Beneficiario',name],
    ['Documento',`${str(p.commissioner_document_type)} ${str(p.commissioner_document_number)}`.trim()],
    ['Teléfono',p.commissioner_phone],
    ['Tipo de comisión',f.ctx.commission_type === 'per_kg_initial' ? 'Bs/kg vivo inicial bruto certificado Campo' : f.ctx.commission_type],
    ['Valor contractual',f.ctx.commission_value],
    ['Base de peso certificada',f.calc.weight_basis_kg==null?'No aplica':`${f.calc.weight_basis_kg} kg`],
    ['Banco',p.commissioner_bank_name],['Cuenta de cobro',p.commissioner_account_number],
    ['Titular',p.commissioner_account_holder],
  ];
  const net=Number(f.settlement.net_payable);
  const buf=await pdfFactory({
    title:'LIQUIDACIÓN DE COMISIÓN',
    subtitle:'Importe aprobado, no constituye constancia de pago',
    rows,adjustments:f.adjustments,
    totals:[['Base de comisión',money(f.calc.base_amount)],
      ['Descuentos',`-${money(f.disc)}`],['Adiciones',`+${money(f.add)}`],
      ...(f.settlement.override_active?[['Ajuste autorizado',money(f.settlement.override_amount)]]:[]),
      ['IMPORTE NETO A PAGAR',money(net)]],qr,
  });
  return {buf,metadata:{amount:net,beneficiary:abbrev(name),lot:p.lot_number,version:p.version}};
}

async function renderTransport(client,p,qr,adjustments,negotiationId) {
  const t=await loadTransport(client,p,negotiationId);
  const transportAdjustments=adjustments.filter(a=>a.target_type==='transport' &&
    Number(a.transport_negotiation_id)===Number(negotiationId));
  const disc=rnd2(transportAdjustments.filter(a=>a.adjustment_type==='discount').reduce((s,a)=>s+Number(a.amount),0));
  const add=rnd2(transportAdjustments.filter(a=>a.adjustment_type==='addition').reduce((s,a)=>s+Number(a.amount),0));
  const net=rnd2(Number(t.trip_price)-disc+add);
  if(net<0) {const e=new Error('Importe transporte inválido');e.status=409;throw e;}
  const rows=[['Lote',p.lot_number],['Preliquidación',`#${p.id} · Versión ${p.version}`],
    ['Estado','OBLIGACIÓN APROBADA · NO ACREDITA PAGO'],
    ['Aprobado el',formatDate(p.approved_at)],['Aprobador',p.approved_by_name],
    ['Negociación',t.negotiation_id],['Solicitud',t.request_id],['Tropa',t.troop_number],
    ['Transportista',t.transporter_name],['Documento',`${str(t.transporter_document_type)} ${str(t.transporter_document_number)}`.trim()],
    ['Teléfono',t.transporter_phone],['Camión',`${str(t.plate)} · ${str(t.brand)} ${str(t.model)}`],
    ['Origen',t.origin],['Destino',t.destination],['Banco',t.bank_name],
    ['Cuenta de cobro',t.account_number],['Titular',t.account_holder]];
  const buf=await pdfFactory({
    title:'LIQUIDACIÓN DE TRANSPORTE',subtitle:'Importe aprobado, no constituye constancia de pago',
    rows,adjustments:transportAdjustments,
    totals:[['Flete pactado',money(t.trip_price)],['Descuentos',`-${money(disc)}`],
      ['Adiciones',`+${money(add)}`],['IMPORTE NETO A PAGAR',money(net)]],qr,
  });
  return {buf,metadata:{amount:net,beneficiary:abbrev(t.transporter_name),lot:p.lot_number,version:p.version}};
}

function verificationUrl(token) {
  const base=process.env.SLAUGHTERHOUSE_DOC_VERIFY_BASE_URL;
  if(!base||!/^https:\/\//i.test(base)) {
    const e=new Error('Configurar SLAUGHTERHOUSE_DOC_VERIFY_BASE_URL con URL HTTPS pública terminada en /documents/verify/');e.status=503;throw e;
  }
  const url=new URL(base.endsWith('/')?base:`${base}/`);
  if(!url.pathname.endsWith('/documents/verify/')) {
    const e=new Error('La URL de verificación no termina en /documents/verify/');e.status=503;throw e;
  }
  return new URL(encodeURIComponent(token),url).toString();
}

async function issue(req,res,pool,kind,renderSeller) {
  let client;
  try {
    const companyId=Number(req.slaughterhouseAdmin?.company_id);
    const preliquidationId=Number(req.params.id);
    if(!Number.isSafeInteger(companyId)||companyId<=0||
       !Number.isSafeInteger(preliquidationId)||preliquidationId<=0) {
      return res.status(400).json({error:'Identificador inválido'});
    }
    const ref=kind==='transport'?Number(req.params.negotiationId):0;
    if(kind==='transport' && (!Number.isSafeInteger(ref)||ref<=0)) {
      return res.status(400).json({error:'Negociación inválida'});
    }
    client=await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[
      `doccompany:${companyId}`,`preliq:${preliquidationId}:${kind}:${ref}`
    ]);
    const p=await loadContext(client,companyId,preliquidationId);
    if(p.status!=='approved') {
      const e=new Error('Solo se emiten documentos de preliquidaciones aprobadas');e.status=409;throw e;
    }
    // Separación multempresa incluso en revocación y descargas.
    const old=await client.query(`
      SELECT id,pdf_bytes,pdf_sha256,revoked_at
      FROM slaughterhouse_issued_documents
      WHERE company_id=$1 AND preliquidation_id=$2 AND document_kind=$3 AND reference_id=$4
      FOR UPDATE
    `,[companyId,preliquidationId,kind,ref]);
    if(old.rowCount) {
      if(old.rows[0].revoked_at) {
        const e=new Error('Documento revocado: se requiere versión nueva de preliquidación');e.status=410;throw e;
      }
      const previous=old.rows[0].pdf_bytes;
      if(sha(previous)!==old.rows[0].pdf_sha256) throw new Error('DOCUMENT_HASH_MISMATCH');
      await client.query('COMMIT');
      return sendPdf(res,previous,`PG_empresa_${companyId}_${kind}_preliquidacion_${preliquidationId}${ref ? `_negociacion_${ref}` : ''}.pdf`);
    }
    const adjustments=await loadAdjustments(client,p.id,companyId);
    const token=crypto.randomBytes(32).toString('base64url');
    const code=`PG-${String(companyId)}-${String(preliquidationId)}-${kind.toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const url=verificationUrl(token);
    const qr={url,code,png:await QRCode.toBuffer(url,{errorCorrectionLevel:'M',margin:1,width:300})};
    let produced;
    if(kind==='seller') {
      const commercial=await loadCommercialDocumentLines(client,companyId,p.purchase_lot_id,p);
      if(!commercial || commercial.total_amount==null) {
        const e=new Error('El PDF certificado requiere líneas comerciales completas');e.status=409;throw e;
      }
      const buf=await existingSellerPdf(req,renderSeller,qr);
      produced={buf,metadata:{amount:Number(p.total_payable),beneficiary:abbrev(p.seller_name),lot:p.lot_number,version:p.version}};
    } else if(kind==='commissioner') {
      produced=await renderCommission(client,p,qr,adjustments);
    } else if(kind==='transport') {
      produced=await renderTransport(client,p,qr,adjustments,ref);
    } else throw new Error('DOCUMENT_KIND_INVALID');
    const {buf,metadata}=produced;
    await client.query(`
      INSERT INTO slaughterhouse_issued_documents
      (company_id,preliquidation_id,document_kind,reference_id,document_code,
       token_sha256,pdf_sha256,pdf_bytes,metadata,issued_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
    `,[companyId,preliquidationId,kind,ref,code,sha(token),sha(buf),buf,
      JSON.stringify(metadata),Number(req.slaughterhouseAdmin.user_id)]);
    await client.query('COMMIT');
    return sendPdf(res,buf,`PG_empresa_${companyId}_${kind}_preliquidacion_${preliquidationId}${ref ? `_negociacion_${ref}` : ''}.pdf`);
  } catch(err) {
    if(client) {try{await client.query('ROLLBACK');}catch(_) {}}
    console.error('FRIGOSI ISSUE CERTIFIED PDF ERROR:',err);
    if(!res.headersSent) return res.status(err.status||500).json({error:err.status?err.message:'No se pudo emitir documento certificado'});
  } finally {if(client)client.release();}
}

function sendPdf(res,buf,filename) {
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
  return res.end(buf);
}

async function verify(req,res,pool) {
  const token=str(req.params.token);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return res.status(404).send('Documento no encontrado');
  try {
    const r=await pool.query(`
      SELECT d.document_kind,d.document_code,d.pdf_sha256,d.issued_at,
        d.revoked_at,d.metadata,sp.status AS preliq_status
      FROM slaughterhouse_issued_documents d
      JOIN slaughterhouse_preliquidations sp ON sp.id=d.preliquidation_id
        AND sp.company_id=d.company_id
      WHERE d.token_sha256=$1 LIMIT 1
    `,[sha(token)]);
    if(!r.rowCount) return res.status(404).send('Documento no encontrado');
    const d=r.rows[0],m=d.metadata||{};
    const valid=!d.revoked_at && d.preliq_status==='approved';
    const title=valid?'DOCUMENTO VIGENTE':'DOCUMENTO SIN VIGENCIA';
    const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Verificación documental</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:50px auto;padding:20px;background:#f5f7f6;color:#1e2c2a}main{background:#fff;border:1px solid #ddd;padding:28px;border-radius:14px}h1{font-size:22px}b{color:${valid?'#176b50':'#a32222'}}dt{font-weight:bold;margin-top:16px}dd{margin:4px 0 0 0;overflow-wrap:anywhere}.note{font-size:13px;color:#666}</style></head><body><main><h1>Plaza Ganadera · Autenticidad</h1><h2><b>${title}</b></h2><dl><dt>Código</dt><dd>${safe(d.document_code)}</dd><dt>Tipo</dt><dd>${safe(d.document_kind)}</dd><dt>Lote</dt><dd>${safe(m.lot)}</dd><dt>Versión</dt><dd>${safe(m.version)}</dd><dt>Beneficiario (iniciales)</dt><dd>${safe(m.beneficiary)}</dd><dt>Importe de la obligación</dt><dd>${money(m.amount)}</dd><dt>Emitido</dt><dd>${safe(new Date(d.issued_at).toISOString())}</dd><dt>Huella SHA-256 del PDF original</dt><dd>${safe(d.pdf_sha256)}</dd></dl><p class="note">La certificación acredita el PDF emitido por el sistema. No certifica transferencia o pago realizado.</p></main></body></html>`;
    return res.status(valid?200:410).type('html').send(html);
  } catch(e) {
    console.error('FRIGOSI VERIFY DOCUMENT ERROR',e);
    return res.status(500).send('Error de verificación');
  }
}

async function revoke(req,res,pool) {
  const company=Number(req.slaughterhouseAdmin?.company_id);
  const id=Number(req.params.documentId);
  const reason=str(req.body?.reason).trim();
  if(!Number.isSafeInteger(company)||!Number.isSafeInteger(id)||id<=0||reason.length<10||reason.length>1000)
    return res.status(400).json({error:'Motivo entre 10 y 1000 caracteres e ID válido requeridos'});
  try {
    const result=await pool.query(`
      UPDATE slaughterhouse_issued_documents SET revoked_at=NOW(),revoked_by=$3,
        revoke_reason=$4
      WHERE company_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id,document_code,revoked_at
    `,[company,id,Number(req.slaughterhouseAdmin.user_id),reason]);
    if(!result.rowCount)return res.status(404).json({error:'Documento inexistente o ya revocado'});
    return res.json({document:result.rows[0],status:'revoked'});
  }catch(e){console.error(e);return res.status(500).json({error:'No se pudo revocar'});}
}

module.exports={issue,verify,revoke,commissionFinancial,renderTransport,renderCommission};
