require 'sketchup.rb'

module VontaPlan
  def self.prepare
    view = Sketchup.active_model.active_view
    target = view.camera.target
    eye = target.offset(Z_AXIS, [view.camera.eye.distance(target), 1.m].max)
    view.camera = Sketchup::Camera.new(eye, target, Y_AXIS, false)
    view.zoom_extents
    UI.messagebox("Top parallel view is ready. Select File > Export > 2D Graphic. Choose DWG or DXF and check Full Scale in Options. Open the file in AutoCAD to dimension the sheet.")
  end

  unless file_loaded?(__FILE__)
    UI.menu('Extensions').add_item('VONTA — Prepare plan for AutoCAD') { prepare }
    file_loaded(__FILE__)
  end
end
