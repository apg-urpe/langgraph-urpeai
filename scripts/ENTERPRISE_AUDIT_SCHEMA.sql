═══════════════════════════════════════════════════════════════════════════════
-- ENTERPRISE AUDIT SCHEMA - Historial de cambios en wp_empresa_perfil
-- Compatible con wp_auditoria existente + vista wp_empresa_historial para el store
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1.Vwp_empre_histria(acompatibiliadcon tore)Eltor swp_mprsa_horia, estvismpasdewp_a
DOPVIWempres_hsl;
CREATEVIEWwp_empresa_htoS
SLECT .ida.ASempresa_ida.a.a.a.a.a.AS craed_t
FROMp_audoriaa
WHERE a.abla = 'wp_eprsa_prfil';

COMMNONVIEWwp_hstorialIS 'Vsadecomatiidad sobre auditoria a storedeempresa';-- =====================================================RIGGERDE
-- =====================================================
cmpnombreTEXTlorlTXTvlo_wTXT;camposdtarT[]:=ARAY['nombe','ciudad','ps',rubro,'nformcion_rearial',
  'pregns_f','svi_gral','embovntas','logo_url','sitio_web',
'telefono',
'email',
dicin'
'gl_goci',caal_cunic
   'tez',
    'tadt'
   'bndg','activo',
mricaiva
   'milmaking'
   'emlack'];
BEGIN
IFTG_OP='UPDATE'THEN
FRAHmpombI ARRAY amp_auditar LOOP--ter vloreco txo (intrcr)EXECTEformat('($1).%I::TEXTcmpomb) INTO vlorld USING OLD;EXECTEformat('($1).%I::TEXTcampo_nome) INTO vlor_wUSIG N;
--olorgisrrsi l vlorcmbióIFvl_oldalr_newTHEN
         
          
          
          accion
      
         NEW
          mbe
          l_ld
          lrnew      'UPDATE'
   ENDIF;

Reretg
g
-- =====================================================3FUNCIÓNPARAOBTENERISTORIAL DEUNAEMPRSA
-- =====================================================
FUNCTONfn_get_enterrise_hstory(
  dBIGINT,  p_campo TEXT DFAUNULL, p_limitINTDEFAULT50
)RETURNSTABLE(
 BIGINT,
 BIGINT TEXT TEXT TEXTBIGINTTX,njemtX,cteTIMSTMPZ)S$$BEGIN   QUERY
  ECTa.  a.registro_idASa.a.a.a.,
   COALESCE(.nombre || ' ' || .apello a.usuario_nombre, 'Sistema') AS usuario_nombre,a.a.feha AS c
FROM p_audoraaLEFTJOINwp_team_hmano u ON a.uid=u.idWHataa = 'pef'ANDagitroaafch=====================================================
-- 4UNCIÓNARARESTAURARVALORANTERIOR
--=====================================================
BIGINTBIGINTBOOLEANempres_dBIGINTv_campoTEXT;
 vaor_anrior TEXTdatos dhrialsdewp_iregistro_id,campo, valor_anterior
  empres_d, v_campo, v_valor_anerior
 
 AND tabla = 'wp_empresa_perfil';
FALSE  Reavlr(etisrál tgger ehisoilautomátamete)EXECUTE
    , fecha_actualizacion = NOW()
    )USINGv_valor_anterior,v_empresa_id;
Atalizar el último regisod historia con mensaje derestaración
  UPDATE w_auitoria
  SET mensje_commi = 'Rstardesdesión',    usuario_id=COALS(p_usuario_id,usuarioid)
  WHERE id = (
   ELECT id FROMwpitora 
    WHERE ba = 'wp_empesapfl' 
      AND_id = v_empresa 
    ORDER BY fecha DESC 
    LIMIT 1
  );
  
  RETURN TRUEEND;$$ LANGUAGEplpgsql;

--=====================================================
--5.GRANTS
=====================================================

GANT SELECT ON wp_emprsa_hoial TO authenticted;
GRANT EXECUTE ON FUNCTION fn_get_enterprise_histoy TOauthenticted;
GRANT EXECUTE ON FUNCTIONfn_restoe_entrprie_field TO authenticaed;

-- =====================================================
-- 6. RLS PARA wp_ditoria (empess)
-- =====================================================

-- Polítia: usuarospudever de su empresaDROPPOLICYIFEXS"Users can view enterprise audit from their enterprise" O wp_auditoria;
CREAE PLICY"Users can view enterrise adt from their enterprise"
  ON 
 FOR SELECT
  USING --Auditoríadeagentes(exisente)
    (
      t= 'wp_agentes' AND IN(
        SELECT .id FROM wpges
        JOIN wptam_hmnt ON t.eprd= a.    WHERE t.auth_uid = auth.uid(
     )
    )
    OR
    -- uditoríade empresa
    tabla=AND IN (
        SELECT es_d FROM wp_emhumtWHR t.auth= 
      
   )OR
tabla = wp_agente_roles'
  );

-- =====================================================
-- COMENTAIOS
-- =====================================================

COMMENT ON FUNCTION fn_audit_wp_mprea_perfil IS 'Trigger que regisr cambios en wp_empresa_perfil (sin trnca vlres)';
COMMENT ON FUNCTIONfn_get_entrpri_ySObtener de cambos e una empresa';COMMENT ON FUNCTIONfn_restore_enterprise_fieldIS'Restauraruncampoaunalor ntero dl hoal';

-- ═══════════════════════════════════════════════════════════════════════════════--INSTRUCCIONESDEUSO
--═══════════════════════════════════════════════════════════════════════════════-- --EstescriptesCOMPATIBL con laestrucua wp_aditoria existent.-- --l store usaw_emresa_hitorial ue ahora es unaVIA sobrewp_auditoria.--ara consulta htrial:--   *FRM WHERE empresa_id = 13;
--   -- ousarl fcón:--  SL*RM(13);
--  SELEC * FRMfn_ge_terprise_hisory(13, 'nformaion_empresarial');
--
-- Par resaurar un valor:--  SL(isorial_d, usurio_i)
--
-- ═══════════════════════════════════════════════════════════════════════════════