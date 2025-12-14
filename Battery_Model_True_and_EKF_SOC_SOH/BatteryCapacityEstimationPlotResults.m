% Code to plot simulation results from BatteryCapacityEstimationExample
%% Plot Description:
%
% This plot shows the real and estimated battery state of charge, 
% estimated capacity, and estimated state of health of the battery.

% Copyright 2023 The MathWorks, Inc.

% Generate simulation results if they don't exist
if ~exist('BatteryCapacityEstimationSimlog', 'var') || ... 
        get_param('BatteryCapacityEstimation','RTWModifiedTimeStamp') ~= double(simscape.logging.timestamp(BatteryCapacityEstimationSimlog))
    sim('BatteryCapacityEstimation')
    % Model StopFcn callback adds a timestamp to the Simscape simulation data log
end

% Reuse figure if it exists, else create new figure
if ~exist('h1_BatteryCapacityEstimation', 'var') || ...
        ~isgraphics(h1_BatteryCapacityEstimation, 'figure')
    h1_BatteryCapacityEstimation = figure('Name', 'BatteryCapacityEstimation');
end
figure(h1_BatteryCapacityEstimation)
clf(h1_BatteryCapacityEstimation)

% Get simulation results
simlog_SOC_real = BatteryCapacityEstimationLogsout.get('real_soc');
simlog_SOC_est = BatteryCapacityEstimationLogsout.get('est_soc');
simlog_SOH_est = BatteryCapacityEstimationLogsout.get('est_soh');
simlog_Cap_real = BatteryCapacityEstimationLogsout.get('real_cap');
simlog_Cap_est = BatteryCapacityEstimationLogsout.get('est_cap');

% Plot results
simlog_handles(1) = subplot(3, 1, 1);
plot(simlog_SOC_real.Values.Time/3600, simlog_SOC_real.Values.Data(:)*100, 'LineWidth', 1)
hold on
plot(simlog_SOC_est.Values.Time/3600, simlog_SOC_est.Values.Data(:)*100, 'LineWidth', 1)
hold off
grid on
title('State of Charge')
ylabel('SOC (%)')
xlabel('Time (hours)')
legend({'Real','Estimated'},'Location','Best');
simlog_handles(1) = subplot(3, 1, 2);
plot(simlog_Cap_real.Values.Time/3600, simlog_Cap_real.Values.Data(:), 'LineWidth', 1)
hold on
plot(simlog_Cap_est.Values.Time/3600, simlog_Cap_est.Values.Data(:), 'LineWidth', 1)
hold off
grid on
title('Battery Capacity')
ylabel('Capacity (A*hr)')
xlabel('Time (hours)')
legend({'Real','Estimated'},'Location','Best');
simlog_handles(1) = subplot(3, 1, 3);
plot(simlog_SOH_est.Values.Time/3600, simlog_SOH_est.Values.Data(:)*100, 'LineWidth', 1)
grid on
title('State of Health')
ylabel('SOH (%)')
xlabel('Time (hours)')

linkaxes(simlog_handles, 'x')  

% Remove temporary variables
clear simlog_SOC_real simlog_SOC_est simlog_Cap_real simlog_Cap_est 
clear simlog_SOH_est simlog_handles