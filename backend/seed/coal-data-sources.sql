-- ============================================================================
-- CoalGuard.AI — Official Indian Coal-Sector Data Source Catalog
--
-- This seed file registers known official data sources from Indian government
-- agencies. All sources are publicly accessible and do not require authentication
-- unless noted.
--
-- Sources are listed in priority order per the specification:
-- 1. Official structured APIs
-- 2. Official downloadable datasets
-- 3. Official machine-readable reports
-- 4. Official PDFs and other published documents
-- ============================================================================

-- 1. Ministry of Coal - Production Statistics
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-moc-production',
  'Ministry of Coal - Production Statistics',
  'Monthly coal production statistics by mine, company, and state from the Ministry of Coal, Government of India.',
  'downloadable_dataset', 'Ministry of Coal, Government of India', 'India',
  'https://coal.gov.in/',
  'production', ARRAY['national','state','mine'], 'Government of India - Open Data',
  false, 10080, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 2. Coal Controller's Organisation - Mine Statistics
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-cco-mines',
  'Coal Controller\'s Organisation - Mine Statistics',
  'Mine-wise statistics including production, despatch, and employment from CCO, Ministry of Coal.',
  'downloadable_dataset', 'Coal Controller\'s Organisation', 'India',
  'https://coalcontroller.gov.in/',
  'mine_identification', ARRAY['mine','subsidiary'], 'Government of India - Open Data',
  false, 43200, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 3. Coal India Limited - Subsidiary Production
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-cil-production',
  'Coal India Limited - Subsidiary Production',
  'Production and operational statistics from CIL subsidiaries (ECL, BCCL, CCL, WCL, SECL, NCL, MCL, NEC).',
  'downloadable_dataset', 'Coal India Limited', 'India',
  'https://coalindia.in/',
  'production', ARRAY['subsidiary','mine'], 'Coal India Limited',
  false, 10080, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 4. Singareni Collieries Company Limited
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-sccil-production',
  'Singareni Collieries Company Limited - Production Data',
  'Production and operational data from SCCL mines in Telangana.',
  'downloadable_dataset', 'Singareni Collieries Company Limited', 'India',
  'https://scclmines.com/',
  'production', ARRAY['mine','state'], 'SCCL',
  false, 10080, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 5. Ministry of Environment, Forest and Climate Change - Environmental Clearances
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-moefcc-clearances',
  'MoEFCC - Environmental Clearances',
  'Environmental clearance documents and compliance reports for coal mining projects.',
  'downloadable_dataset', 'Ministry of Environment, Forest and Climate Change', 'India',
  'https://parivesh.nic.in/',
  'environmental', ARRAY['mine','subsidiary'], 'Government of India - Open Data',
  false, 20160, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 6. Central Pollution Control Board - Environmental Monitoring
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-cpcb-monitoring',
  'CPCB - Environmental Monitoring Data',
  'Air quality, water quality, and environmental monitoring data from CPCB monitoring stations.',
  'government_api', 'Central Pollution Control Board', 'India',
  'https://cpcb.nic.in/',
  'environmental', ARRAY['mine','subsidiary'], 'Government of India - Open Data',
  true, 1440, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 7. Directorate General of Mines Safety - Safety Statistics
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-dgms-safety',
  'DGMS - Mine Safety Statistics',
  'Mine accident statistics, inspection reports, and safety violations from DGMS.',
  'downloadable_dataset', 'Directorate General of Mines Safety', 'India',
  'https://dgms.gov.in/',
  'safety_compliance', ARRAY['mine','subsidiary'], 'Government of India - Open Data',
  false, 20160, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 8. data.gov.in - National Data Portal
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-datagovin',
  'data.gov.in - National Open Data Portal',
  'Aggregated government datasets including coal production, mining statistics, and environmental data.',
  'government_api', 'data.gov.in - National Informatics Centre', 'India',
  'https://data.gov.in/',
  'other', ARRAY['national','state'], 'Government of India - Open Data (NODS)',
  true, 10080, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- 9. Ministry of Labour and Employment - Workforce Statistics
INSERT INTO data_sources (
  id, name, description, source_type, publisher, jurisdiction, base_url,
  category, granularity, license, automated_retrieval,
  refresh_interval_minutes, created_by, updated_by
) VALUES (
  'src-mol-employment',
  'Ministry of Labour - Mining Workforce Statistics',
  'Employment and workforce statistics for the mining sector.',
  'downloadable_dataset', 'Ministry of Labour and Employment', 'India',
  'https://labour.gov.in/',
  'workforce_contractor', ARRAY['state','national'], 'Government of India - Open Data',
  false, 20160, 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Dataset catalog entries for each source
-- ============================================================================

-- Ministry of Coal - Monthly Production
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-moc-monthly-production',
  'src-moc-production',
  'monthly_coal_production',
  'Monthly Coal Production Statistics',
  'Monthly coal production by mine, state, and company from Ministry of Coal.',
  'csv', NULL, NULL, NULL,
  'https://coal.gov.in/major-statistics',
  NULL, 'GET',
  '{"mine_name": "mine_name", "state": "state", "production_tonnes": "production_tonnes", "month": "month", "year": "year"}',
  '{"production_tonnes": "tonnes"}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- CCO - Mine Statistics
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-cco-mine-stats',
  'src-cco-mines',
  'cco_mine_statistics',
  'CCO Mine-wise Statistics',
  'Mine-wise production, despatch, and employment statistics from Coal Controller\'s Organisation.',
  'csv', NULL, NULL, NULL,
  'https://coalcontroller.gov.in/statistics',
  NULL, 'GET',
  '{"mine_code": "official_mine_id", "mine_name": "mine_name", "company": "operating_company", "state": "state", "district": "district"}',
  '{}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- CIL - Subsidiary Production
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-cil-subsidiary-production',
  'src-cil-production',
  'cil_subsidiary_production',
  'CIL Subsidiary Production Data',
  'Production statistics from CIL subsidiaries (ECL, BCCL, CCL, WCL, SECL, NCL, MCL, NEC).',
  'csv', NULL, NULL, NULL,
  'https://coalindia.in/production-statistics',
  NULL, 'GET',
  '{"subsidiary": "subsidiary_name", "production_tonnes": "production_tonnes", "month": "month", "year": "year"}',
  '{"production_tonnes": "tonnes"}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- SCCL - Production Data
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-sccil-production',
  'src-sccil-production',
  'sccl_production',
  'SCCL Mine Production Data',
  'Production data from Singareni Collieries Company Limited mines.',
  'csv', NULL, NULL, NULL,
  'https://scclmines.com/production',
  NULL, 'GET',
  '{"mine_name": "mine_name", "production_tonnes": "production_tonnes", "month": "month", "year": "year"}',
  '{"production_tonnes": "tonnes"}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- MoEFCC - Environmental Clearances
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-moefcc-clearances',
  'src-moefcc-clearances',
  'moefcc_environmental_clearances',
  'MoEFCC Environmental Clearances',
  'Environmental clearance documents for coal mining projects including conditions and compliance requirements.',
  'pdf_document', NULL, NULL, NULL,
  'https://parivesh.nic.in/',
  NULL, 'GET',
  '{"project_name": "project_name", "mine_name": "mine_name", "state": "state", "clearance_date": "clearance_date"}',
  '{}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- CPCB - Air Quality Monitoring
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-cpcb-air-quality',
  'src-cpcb-monitoring',
  'cpcb_air_quality',
  'CPCB Air Quality Monitoring Data',
  'Real-time air quality monitoring data from CPCB stations including PM10, PM2.5, SO2, NO2.',
  'government_api', NULL, NULL, NULL,
  'https://app.cpcbccr.com/ccr/#/caaqm-dashboard-all/caaqm-landscape',
  'https://app.cpcbccr.com/ccr/#/caaqm-dashboard-all/caaqm-landscape/data',
  'GET',
  '{"station_name": "station_name", "pm10": "pm10", "pm25": "pm25", "so2": "so2", "no2": "no2", "date": "date"}',
  '{"pm10": "µg/m³", "pm25": "µg/m³", "so2": "µg/m³", "no2": "µg/m³"}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- DGMS - Safety Statistics
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-dgms-safety-stats',
  'src-dgms-safety',
  'dgms_safety_statistics',
  'DGMS Mine Safety Statistics',
  'Mine accident statistics, dangerous occurrences, and safety violations from DGMS.',
  'csv', NULL, NULL, NULL,
  'https://dgms.gov.in/statistics',
  NULL, 'GET',
  '{"mine_name": "mine_name", "accident_type": "accident_type", "date_of_accident": "date", "fatalities": "fatalities", "injuries": "injuries"}',
  '{}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- data.gov.in - Coal Production
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-datagovin-coal-production',
  'src-datagovin',
  'datagovin_coal_production',
  'data.gov.in Coal Production Statistics',
  'National coal production statistics aggregated from multiple sources.',
  'government_api', NULL, NULL, NULL,
  'https://data.gov.in/',
  'https://data.gov.in/api/datastore/resource.json',
  'GET',
  '{"state": "state", "production_tonnes": "production_tonnes", "year": "year", "month": "month"}',
  '{"production_tonnes": "tonnes"}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;

-- MoL&E - Workforce Statistics
INSERT INTO dataset_catalog (
  id, source_id, dataset_name, dataset_title, description, format,
  reporting_period_start, reporting_period_end, publication_date,
  download_url, api_endpoint, api_method,
  field_mappings, unit_normalizations, download_status, created_by, updated_by
) VALUES (
  'ds-mol-workforce',
  'src-mol-employment',
  'mol_workforce_statistics',
  'Ministry of Labour Mining Workforce Statistics',
  'Employment statistics for the mining sector including contract workers.',
  'csv', NULL, NULL, NULL,
  'https://labour.gov.in/statistics',
  NULL, 'GET',
  '{"state": "state", "mine_type": "mine_type", "workers_employed": "workers_employed", "contract_workers": "contract_workers"}',
  '{}',
  'pending', 'system', 'system'
) ON CONFLICT (id) DO NOTHING;
