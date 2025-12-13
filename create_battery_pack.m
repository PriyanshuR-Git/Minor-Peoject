% Create battery pack for EV application
% Save as: create_battery_pack.m

function create_battery_pack()
    % Load cell parameters
    load('Li_ion_18650_params.mat', 'cell_params');
    
    % Pack configuration for EV (adjust based on your needs)
    pack_config = struct();
    
    % Series-parallel configuration
    pack_config.SeriesCells = 10;        % 10S for ~37V nominal
    pack_config.ParallelCells = 1;       % 1P for simplicity
    pack_config.TotalCells = 10;
    
    % Pack specifications
    pack_config.NominalVoltage = 37;     % 10 × 3.7V
    pack_config.MaxVoltage = 42;         % 10 × 4.2V  
    pack_config.MinVoltage = 28;         % 10 × 2.8V
    pack_config.PackCapacity = 2.6;      % Same as single cell (1P)
    pack_config.PackEnergy = 96.2;       % Wh (37V × 2.6Ah)
    
    % Thermal configuration
    pack_config.AmbientTemp = 298.15;    % K (25°C)
    pack_config.ThermalTimeConstant = 900; % seconds (15 minutes)
    
    save('BatteryPack_10S1P.mat', 'pack_config', 'cell_params');
    
    fprintf('✅ Battery pack configuration created\n');
    fprintf('   Configuration: %dS%dP (%d cells total)\n', ...
        pack_config.SeriesCells, pack_config.ParallelCells, pack_config.TotalCells);
    fprintf('   Pack voltage: %.1f - %.1f V\n', ...
        pack_config.MinVoltage, pack_config.MaxVoltage);
    fprintf('   Pack energy: %.1f Wh\n', pack_config.PackEnergy);
end