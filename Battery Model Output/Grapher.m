%% MATLAB Script for Consolidated EV Battery Digital Twin Visualization (Y-axis Fixed)
% File: plot_consolidated_data_fixed.m
% Date: December 14, 2025

% --- 1. FILE SELECTION AND IMPORT ---
disp('Starting MATLAB data import and consolidated plotting...');

[filename, pathname] = uigetfile('*.csv', 'Select the EV Simulation Data CSV File');

if isequal(filename, 0) || isequal(pathname, 0)
    disp('User cancelled file selection. Script terminated.');
    return;
end

fullFilePath = fullfile(pathname, filename);
disp(['Loading file: ', fullFilePath]);

try
    data = readtable(fullFilePath);
catch ME
    error('Failed to read CSV file. Ensure the file is not open and is correctly formatted.');
end

% --- 2. DATA EXTRACTION ---
Time = data.Time_s;
Current = data.Current_A;
Voltage = data.Voltage_V;
Temperature = data.Temperature_C;
SOC_Actual = data.SOC_Actual_pct;
SOC_Model = data.SOC_Model_pct;
SOH_Actual = data.SOH_Actual_pct;
SOH_Model = data.SOH_Model_pct;

%% --- 3. CONSOLIDATED PLOT GENERATION ---

figure('Name', 'EV Battery Digital Twin: Consolidated Metrics', 'Position', [100 100 1000 800]); 
sgtitle('EV Battery Digital Twin Simulation Results (Y-axis fixed for SOH)', 'FontSize', 16, 'FontWeight', 'bold');

% --- PLOT 1: CURRENT ---
subplot(3, 2, 1);
plot(Time, Current, 'LineWidth', 1.5, 'Color', [0 0.5 0]);
title('Battery Current (A)');
xlabel('Time (s)');
ylabel('Current (A)');
grid on;
box on;
set(gca, 'FontSize', 10);

% --- PLOT 2: VOLTAGE ---
subplot(3, 2, 2);
plot(Time, Voltage, 'LineWidth', 1.5, 'Color', [0.8 0.4 0]);
title('Battery Terminal Voltage (V)');
xlabel('Time (s)');
ylabel('Voltage (V)');
grid on;
box on;
set(gca, 'FontSize', 10);

% --- PLOT 3: TEMPERATURE ---
subplot(3, 2, 3);
plot(Time, Temperature, 'LineWidth', 1.5, 'Color', [0.8 0 0]);
title('Battery Temperature (°C)');
xlabel('Time (s)');
ylabel('Temperature (°C)');
grid on;
box on;
set(gca, 'FontSize', 10);

% --- PLOT 4: SOC (ACTUAL vs. MODEL) ---
subplot(3, 2, 4);
plot(Time, SOC_Actual, 'LineWidth', 2, 'Color', [0.1 0.5 0.8]);
hold on;
plot(Time, SOC_Model, '--', 'LineWidth', 1, 'Color', [0.8 0.2 0.8]);
hold off;
title('State-of-Charge (SOC) Tracking');
xlabel('Time (s)');
ylabel('SOC (%)');
legend('Actual', 'Model', 'Location', 'best', 'FontSize', 8);
grid on;
box on;
set(gca, 'FontSize', 10);

% --- PLOT 5: SOH (ACTUAL vs. MODEL) - Spans Bottom Row ---
subplot(3, 1, 3);
plot(Time, SOH_Actual, 'LineWidth', 2, 'Color', [0.5 0 0.5]);
hold on;
plot(Time, SOH_Model, '--', 'LineWidth', 1, 'Color', [0 0.7 0.7]);
hold off;
title('State-of-Health (SOH) Tracking');
xlabel('Time (s)');
ylabel('SOH (%)');

% *** FIX APPLIED HERE ***
% Set the Y-axis limits to a range that highlights the small change in SOH.
% We use 99% as the bottom, or the minimum SOH value if it's lower.
minSOH = min([min(SOH_Actual), min(SOH_Model)]);
y_min = max(99.0, floor(minSOH * 10) / 10); % Ensures the bottom is at least 99.0%
ylim([y_min 100.1]); % Set top to 100.1% for a clean boundary

legend('Actual', 'Model', 'Location', 'southwest', 'FontSize', 10);
grid on;
box on;
set(gca, 'FontSize', 12);

disp('Consolidated plotting complete with fixed SOH Y-axis.');