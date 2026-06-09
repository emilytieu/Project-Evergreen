-- -----------------------------
-- Manufacturers
-- -----------------------------
CREATE TABLE manufacturers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    country VARCHAR(100),
    website TEXT,
    notes TEXT
);

-- -----------------------------
-- Component Types
-- -----------------------------
CREATE TABLE component_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO component_types (name) VALUES
('Electrolyzer'),
('Fuel Cell'),
('Compressor'),
('Hydrogen Tank'),
('Battery'),
('Inverter'),
('Hydrogen Dryer'),
('Cooling System'),
('Power Supply'),
('DC/DC Converter');

-- -----------------------------
-- Generic Components
-- -----------------------------
CREATE TABLE components (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(100),
    model_name VARCHAR(100),
    country VARCHAR(100),
    year_created VARCHAR(50),
    price_usd DECIMAL(12,2),
    
    attributes JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- ELECTROLYZERS
-- =====================================================

CREATE TABLE electrolyzers (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    electrolyzer_type VARCHAR(100),
    input_power_type VARCHAR(20),
    power_consumption_kw NUMERIC(12,2),
    water_consumption_lph NUMERIC(12,2),
    hydrogen_production_rate_kgph NUMERIC(12,4),
    hydrogen_output_pressure_bar NUMERIC(12,2),
    hydrogen_purity_percent NUMERIC(5,2),
    efficiency_percent NUMERIC(5,2),
    system_lifetime_hours INTEGER,
    turndown_min_percent NUMERIC(5,2),
    turndown_max_percent NUMERIC(5,2),
    compressor_included BOOLEAN,
    compressor_output_pressure_bar NUMERIC(12,2),
    min_environment_temp_c NUMERIC(6,2),
    max_environment_temp_c NUMERIC(6,2),
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- FUEL CELLS
-- =====================================================

CREATE TABLE fuel_cells (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    fuel_cell_type VARCHAR(100),
    rated_power_kw NUMERIC(12,2),
    input_hydrogen_pressure_bar NUMERIC(12,2),
    hydrogen_consumption_kgph NUMERIC(12,4),
    electrical_efficiency_percent NUMERIC(5,2),
    heat_output_kw NUMERIC(12,2),
    output_voltage_v NUMERIC(12,2),
    output_current_a NUMERIC(12,2),
    lifetime_hours INTEGER,
    min_temp_c NUMERIC(6,2),
    max_temp_c NUMERIC(6,2),
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- COMPRESSORS
-- =====================================================

CREATE TABLE compressors (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    gas_type VARCHAR(50),
    inlet_pressure_bar NUMERIC(12,2),
    outlet_pressure_bar NUMERIC(12,2),
    flow_rate_kgph NUMERIC(12,4),
    power_consumption_kw NUMERIC(12,2),
    cooling_required BOOLEAN,
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- HYDROGEN STORAGE TANKS
-- =====================================================

CREATE TABLE storage_tanks (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    tank_type VARCHAR(100),
    storage_pressure_bar NUMERIC(12,2),
    hydrogen_capacity_kg NUMERIC(12,3),
    volume_liters NUMERIC(12,2),
    material VARCHAR(100),
    certification VARCHAR(100),
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- BATTERIES
-- =====================================================

CREATE TABLE batteries (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    chemistry VARCHAR(100),
    nominal_voltage_v NUMERIC(12,2),
    capacity_kwh NUMERIC(12,2),
    max_charge_kw NUMERIC(12,2),
    max_discharge_kw NUMERIC(12,2),
    round_trip_efficiency_percent NUMERIC(5,2),
    cycle_life INTEGER,
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- INVERTERS
-- =====================================================

CREATE TABLE inverters (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    rated_power_kw NUMERIC(12,2),
    input_voltage_v NUMERIC(12,2),
    output_voltage_v NUMERIC(12,2),
    efficiency_percent NUMERIC(5,2),
    phase_type VARCHAR(50),
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- HYDROGEN DRYERS
-- =====================================================

CREATE TABLE hydrogen_dryers (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    flow_rate_kgph NUMERIC(12,4),
    inlet_pressure_bar NUMERIC(12,2),
    outlet_dew_point_c NUMERIC(12,2),
    power_consumption_kw NUMERIC(12,2),
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- COOLING SYSTEMS
-- =====================================================

CREATE TABLE cooling_systems (
    component_id INTEGER PRIMARY KEY
        REFERENCES components(id)
        ON DELETE CASCADE,
    cooling_capacity_kw NUMERIC(12,2),
    coolant_type VARCHAR(100),
    power_consumption_kw NUMERIC(12,2),
    operating_temp_min_c NUMERIC(6,2),
    operating_temp_max_c NUMERIC(6,2),
    price_usd NUMERIC(15,2)
);

-- =====================================================
-- PROJECTS / SYSTEM BUILDER
-- =====================================================

CREATE TABLE system_projects (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) NOT NULL,
    description TEXT,
    target_hydrogen_output_kg_day NUMERIC(12,2),
    target_power_kw NUMERIC(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PROJECT COMPONENTS
-- =====================================================

CREATE TABLE system_components (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL
        REFERENCES system_projects(id)
        ON DELETE CASCADE,
    component_id INTEGER NOT NULL
        REFERENCES components(id)
        ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    position_x NUMERIC(12,2),
    position_y NUMERIC(12,2),
    UNIQUE(project_id, component_id)
);

-- =====================================================
-- CONNECTIONS BETWEEN COMPONENTS
-- =====================================================

CREATE TABLE component_connections (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL
        REFERENCES system_projects(id)
        ON DELETE CASCADE,
    source_component_id INTEGER NOT NULL
        REFERENCES components(id),
    destination_component_id INTEGER NOT NULL
        REFERENCES components(id),
    connection_type VARCHAR(50),
    max_flow_rate NUMERIC(12,4),
    pressure_bar NUMERIC(12,2),
    notes TEXT
);