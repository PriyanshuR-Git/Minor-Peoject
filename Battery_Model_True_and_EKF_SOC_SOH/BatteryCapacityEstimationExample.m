%% Estimate Battery State of Health Based on Capacity Fade
% This example shows how to estimate the battery capacity and 
% state of health (SOH) by using a Kalman filter. The initial state of 
% charge (SOC) of the battery is equal to 0.5. The estimator uses 
% an initial condition for the SOC equal to 0.8. The battery keeps 
% charging and discharging for 50 hours. The example estimates the battery 
% capacity, in ampere-hour, and the SOC by using an extended Kalman Filter. 
% The estimation error for the battery capacity is less than 4%. The SOC 
% is estimated using an extended Kalman filter. When using fixed capacity 
% the estimated SOC value diverges from the true value. To demonstrate the
% functionality of the estimator and to restrict the duration of the 
% simulation, this example models an increased capacity fade rate.

% Copyright 2023 The MathWorks, Inc.

%% Model

open_system('BatteryCapacityEstimation')

set_param(find_system('BatteryCapacityEstimation','FindAll', 'on','type','annotation','Tag','ModelFeatures'),'Interpreter','off')

%% Simulation Results
%
% This plot shows the real and estimated battery state of charge, 
% estimated capacity, and estimated state of health of the battery.
%


BatteryCapacityEstimationPlotResults;

%% Results from Real-Time Simulation
%%
%
% This example has been tested on a Speedgoat Performance real-time target 
% machine with an Intel(R) 3.5 GHz i7 multi-core CPU. This model can run 
% in real time with a step size of 100 microseconds.